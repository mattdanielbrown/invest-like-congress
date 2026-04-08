import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const { Client } = pg;

function parseArgument(name, fallbackValue) {
	const prefix = `--${name}=`;
	const match = process.argv.find((argument) => argument.startsWith(prefix));
	if (!match) {
		return fallbackValue;
	}
	return match.slice(prefix.length);
}

function parseHouseIndexText(indexText) {
	return indexText
		.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => line.split("\t"))
		.filter((columns) => columns.length >= 9 && columns[4] === "P")
		.map((columns) => ({
			prefix: columns[0],
			lastName: columns[1],
			firstName: columns[2],
			suffix: columns[3],
			filingType: columns[4],
			stateDistrict: columns[5],
			year: Number(columns[6]),
			filedAt: columns[7],
			documentId: columns[8]
		}));
}

function normalizeDate(value) {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return value;
	}
	const parts = value.split(/[/-]/);
	if (parts.length !== 3) {
		return value;
	}
	const [month, day, year] = parts;
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function buildSourceTransactionKey(memberId, assetId, action, tradeDate, filingDocumentId, totalAmountMin, totalAmountMax, ordinal) {
	const payload = [memberId, assetId, action, tradeDate, filingDocumentId, totalAmountMin ?? "", totalAmountMax ?? "", ordinal].join("|");
	return createHash("sha256").update(payload).digest("hex");
}

function extractPdfText(pdfBytes) {
	const text = Buffer.from(pdfBytes).toString("latin1");
	const matches = [...text.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)];
	if (matches.length === 0) {
		return text;
	}

	return matches
		.map((match) => match[1])
		.join("\n")
		.replaceAll(/\\n/g, "\n")
		.replaceAll(/\\r/g, " ")
		.replaceAll(/\\t/g, " ")
		.replaceAll(/\\\(/g, "(")
		.replaceAll(/\\\)/g, ")")
		.replaceAll(/\\\\/g, "\\");
}

function parsePtrCandidatesFromText(text) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replaceAll(/\s+/g, " ").trim())
		.filter((line) => line.length > 0);

	const candidates = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const actionMatch = line.match(/\b(Purchase|Sale)\b/i);
		if (!actionMatch) {
			continue;
		}

		const action = actionMatch[1].toLowerCase() === "purchase" ? "buy" : "sell";
		const assetLine = lines[index - 1] ?? line;
		const joined = [assetLine, line, lines[index + 1] ?? ""].join(" ");
		const dateMatch = joined.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
		const amountMatch = joined.match(/\$?(\d[\d,]*)\s*-\s*\$?(\d[\d,]*)/);
		if (!dateMatch || !amountMatch) {
			continue;
		}

		const dateValue = normalizeDate(dateMatch[1]);
		const min = Number(amountMatch[1].replaceAll(",", ""));
		const max = Number(amountMatch[2].replaceAll(",", ""));
		const assetName = assetLine.replaceAll(/\([^)]*\)/g, "").trim();
		const tickerMatch = assetLine.match(/\(([A-Z]{1,5})\)/);

		candidates.push({
			assetDisplayName: assetName || "unknown-asset",
			tickerSymbol: tickerMatch?.[1] ?? null,
			action,
			tradeDate: dateValue,
			totalAmountMin: min,
			totalAmountMax: max,
			provenance: [
				{ fieldName: "asset_name", fieldValue: assetName, sourceText: assetLine, sourceLocation: `line:${index}` },
				{ fieldName: "action", fieldValue: action, sourceText: line, sourceLocation: `line:${index + 1}` },
				{ fieldName: "trade_date", fieldValue: dateValue, sourceText: joined, sourceLocation: `line:${index + 1}` },
				{ fieldName: "amount_range", fieldValue: `${min}-${max}`, sourceText: joined, sourceLocation: `line:${index + 1}` }
			]
		});
	}

	return candidates;
}

async function ensureDirectory(directoryPath) {
	await fs.mkdir(directoryPath, { recursive: true });
}

async function fetchHouseReferences(fromYear, toYear) {
	const references = [];
	for (let year = fromYear; year <= toYear; year += 1) {
		const response = await fetch(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.txt`);
		if (!response.ok) {
			continue;
		}

		const text = await response.text();
		const rows = parseHouseIndexText(text);
		for (const row of rows) {
			const memberDisplayName = [row.prefix, row.firstName, row.lastName, row.suffix].filter(Boolean).join(" ");
			references.push({
				sourceSystem: "house-disclosures",
				sourceDocumentId: `house-${year}-${row.documentId}`,
				documentUrl: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${row.documentId}.pdf`,
				filedAt: normalizeDate(row.filedAt),
				memberDisplayName,
				chamber: "house"
			});
		}
	}
	return references;
}

function parseSetCookieHeader(response) {
	const rawHeader = response.headers.get("set-cookie") ?? "";
	if (!rawHeader) {
		return "";
	}
	return rawHeader
		.split(",")
		.map((piece) => piece.trim().split(";")[0])
		.filter((cookie) => cookie.includes("="))
		.join("; ");
}

function parseCsrfToken(html) {
	const match = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/i);
	return match?.[1] ?? "";
}

async function createSenateSession() {
	const homeResponse = await fetch("https://efdsearch.senate.gov/search/home/");
	if (!homeResponse.ok) {
		return null;
	}
	const homeHtml = await homeResponse.text();
	const csrfToken = parseCsrfToken(homeHtml);
	if (!csrfToken) {
		return null;
	}
	const initialCookies = parseSetCookieHeader(homeResponse);
	const agreementResponse = await fetch("https://efdsearch.senate.gov/search/home/", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: initialCookies,
			Referer: "https://efdsearch.senate.gov/search/home/"
		},
		body: new URLSearchParams({
			prohibition_agreement: "1",
			csrfmiddlewaretoken: csrfToken
		}).toString()
	});

	if (!agreementResponse.ok) {
		return null;
	}
	const agreedCookies = parseSetCookieHeader(agreementResponse);
	return [initialCookies, agreedCookies].filter(Boolean).join("; ");
}

async function fetchSenateReferences(fromYear, toYear) {
	const complianceMode = process.env.SENATE_COMPLIANCE_MODE ?? "strict-non-commercial";
	if (complianceMode === "manual") {
		return [];
	}

	const cookieHeader = await createSenateSession();
	if (!cookieHeader) {
		return [];
	}

	const references = [];
	const reportDataPath = process.env.SENATE_REPORT_DATA_PATH ?? "/search/report/data/";
	for (let page = 0; page < 40; page += 1) {
		const length = 100;
		const start = page * length;
		const response = await fetch(`https://efdsearch.senate.gov${reportDataPath}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: cookieHeader,
				Referer: "https://efdsearch.senate.gov/search/"
			},
			body: new URLSearchParams({
				draw: String(page + 1),
				start: String(start),
				length: String(length),
				"search[value]": "periodic transaction",
				"search[regex]": "false"
			}).toString()
		});

		if (!response.ok) {
			break;
		}

		let payload;
		try {
			payload = await response.json();
		} catch {
			break;
		}

		const rows = Array.isArray(payload?.data) ? payload.data : [];
		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			const reportType = String(row.report_type ?? row.type ?? "").toLowerCase();
			if (reportType && !reportType.includes("periodic") && !reportType.includes("transaction")) {
				continue;
			}

			const filingUuid = String(row.filing_uuid ?? row.uuid ?? row.document_id ?? "").trim();
			const filerName = String(row.filer_name ?? row.name ?? "").trim();
			const dateReceived = normalizeDate(String(row.date_received ?? row.date_filed ?? row.filed_at ?? "").trim());
			const year = Number(dateReceived.slice(0, 4)) || 0;
			if (!filingUuid || !filerName || !dateReceived) {
				continue;
			}
			if (year < fromYear || year > toYear) {
				continue;
			}

			references.push({
				sourceSystem: "senate-disclosures",
				sourceDocumentId: `senate-${filingUuid}`,
				documentUrl: `https://efdsearch.senate.gov/search/view/ptr/${filingUuid}/`,
				filedAt: dateReceived,
				memberDisplayName: filerName,
				chamber: "senate"
			});
		}
	}

	return references;
}

async function persistCheckpoint(client, sourceSystem, cursorKey, lastSeenFiledAt) {
	await client.query(
		`INSERT INTO ingestion_checkpoints (source_system, cursor_key, last_seen_filed_at, last_run_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (source_system, cursor_key)
		 DO UPDATE SET
			last_seen_filed_at = EXCLUDED.last_seen_filed_at,
			last_run_at = now()`,
		[sourceSystem, cursorKey, lastSeenFiledAt]
	);
}

async function persistRunSummary(client, summary) {
	await client.query(
		`INSERT INTO ingestion_run_summaries (
			run_id,
			mode,
			source_system,
			cursor_key,
			from_year,
			to_year,
			started_at,
			finished_at,
			success,
			failure_reason,
			fetched_documents,
			parsed_documents,
			quarantined_documents,
			extracted_transactions,
			provenance_coverage_ratio,
			warnings_json
		)
		VALUES (
			$1, $2, 'official-ptr', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
		)
		ON CONFLICT (run_id)
		DO UPDATE SET
			finished_at = EXCLUDED.finished_at,
			success = EXCLUDED.success,
			failure_reason = EXCLUDED.failure_reason,
			fetched_documents = EXCLUDED.fetched_documents,
			parsed_documents = EXCLUDED.parsed_documents,
			quarantined_documents = EXCLUDED.quarantined_documents,
			extracted_transactions = EXCLUDED.extracted_transactions,
			provenance_coverage_ratio = EXCLUDED.provenance_coverage_ratio,
			warnings_json = EXCLUDED.warnings_json`,
		[
			summary.runId,
			summary.mode,
			summary.cursorKey,
			summary.fromYear,
			summary.toYear,
			summary.startedAt,
			summary.finishedAt,
			summary.success,
			summary.failureReason,
			summary.fetchedDocuments,
			summary.parsedDocuments,
			summary.quarantinedDocuments,
			summary.extractedTransactions,
			summary.provenanceCoverageRatio,
			JSON.stringify(summary.warnings)
		]
	);
}

function toPositiveNumber(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

function toMidpointAmount(transaction) {
	const minimumAmount = toPositiveNumber(transaction.total_amount_min);
	const maximumAmount = toPositiveNumber(transaction.total_amount_max);
	if (!minimumAmount && !maximumAmount) {
		return null;
	}
	if (minimumAmount && maximumAmount) {
		return (minimumAmount + maximumAmount) / 2;
	}
	return minimumAmount ?? maximumAmount;
}

function estimateSharesAndPrice(transaction) {
	let shares = toPositiveNumber(transaction.share_quantity);
	let pricePerShare = toPositiveNumber(transaction.price_per_share);
	const midpointAmount = toMidpointAmount(transaction);

	if (!shares && midpointAmount && pricePerShare) {
		shares = midpointAmount / pricePerShare;
	}
	if (!shares && midpointAmount) {
		shares = 1;
	}
	if (!pricePerShare && midpointAmount) {
		pricePerShare = midpointAmount / (shares ?? 1);
	}
	if (!shares || !pricePerShare) {
		return null;
	}

	return {
		shares,
		pricePerShare
	};
}

function buildPositionChangeAction(action, sharesBefore, sharesAfter) {
	if (action === "buy") {
		return sharesBefore <= 0 ? "position-opened" : "position-increased";
	}
	return sharesAfter <= 0 ? "position-closed" : "position-partially-sold";
}

async function rebuildDerivedPortfolioState(client) {
	const transactionsResult = await client.query(
		`SELECT
			id,
			member_id,
			asset_id,
			action,
			trade_date,
			share_quantity,
			price_per_share,
			total_amount_min,
			total_amount_max
		FROM normalized_transactions
		WHERE verification_status = 'verified'
		ORDER BY member_id ASC, asset_id ASC, trade_date ASC, id ASC`
	);

	const transactionsByPair = new Map();
	for (const row of transactionsResult.rows) {
		const pairKey = `${row.member_id}:${row.asset_id}`;
		const currentRows = transactionsByPair.get(pairKey) ?? [];
		currentRows.push(row);
		transactionsByPair.set(pairKey, currentRows);
	}

	const holdingRows = [];
	const realizedRows = [];
	const positionStateRows = [];
	const positionChangeRows = [];

	for (const [pairKey, pairTransactions] of transactionsByPair.entries()) {
		const [memberId, assetId] = pairKey.split(":");
		const lots = [];
		let sharesBefore = 0;

		for (const transaction of pairTransactions) {
			const estimate = estimateSharesAndPrice(transaction);
			if (!estimate) {
				continue;
			}

			const tradeShares = estimate.shares;
			const tradePrice = estimate.pricePerShare;
			let realizedProfitLoss = null;

			if (transaction.action === "buy") {
				lots.push({
					shares: tradeShares,
					costBasisPerShare: tradePrice
				});
			} else {
				let sharesToSell = tradeShares;
				let realizedForTransaction = 0;
				while (sharesToSell > 0 && lots.length > 0) {
					const earliestLot = lots[0];
					const lotSharesToSell = Math.min(earliestLot.shares, sharesToSell);
					realizedForTransaction += lotSharesToSell * (tradePrice - earliestLot.costBasisPerShare);
					earliestLot.shares -= lotSharesToSell;
					sharesToSell -= lotSharesToSell;
					if (earliestLot.shares <= 0.000001) {
						lots.shift();
					}
				}
				realizedProfitLoss = realizedForTransaction;
				realizedRows.push({
					id: randomUUID(),
					memberId,
					assetId,
					sourceTransactionId: transaction.id,
					realizedProfitLoss: realizedForTransaction
				});
			}

			const sharesAfter = lots.reduce((sum, lot) => sum + lot.shares, 0);
			const positionStatus = sharesAfter > 0.000001 ? "open" : "closed";
			positionStateRows.push({
				id: randomUUID(),
				sourceTransactionId: transaction.id,
				positionStatus
			});

			positionChangeRows.push({
				id: randomUUID(),
				memberId,
				assetId,
				action: buildPositionChangeAction(transaction.action, sharesBefore, sharesAfter),
				shareDelta: transaction.action === "buy" ? tradeShares : -tradeShares,
				realizedProfitLoss,
				sourceTransactionId: transaction.id
			});

			sharesBefore = sharesAfter;
		}

		const sharesHeld = lots.reduce((sum, lot) => sum + lot.shares, 0);
		const totalCostBasis = lots.reduce((sum, lot) => sum + (lot.shares * lot.costBasisPerShare), 0);
		const averageCostBasisPerShare = sharesHeld > 0.000001 ? totalCostBasis / sharesHeld : 0;

		holdingRows.push({
			id: randomUUID(),
			memberId,
			assetId,
			sharesHeld,
			averageCostBasisPerShare,
			lastMarketPrice: null,
			unrealizedProfitLoss: null,
			status: sharesHeld > 0.000001 ? "open" : "closed",
			verificationStatus: "verified"
		});
	}

	await client.query("BEGIN");
	try {
		await client.query("DELETE FROM realized_profit_events");
		await client.query("DELETE FROM position_state_events");
		await client.query("DELETE FROM holding_snapshots");
		await client.query("DELETE FROM position_change_events");

		for (const row of holdingRows) {
			await client.query(
				`INSERT INTO holding_snapshots (
					id,
					member_id,
					asset_id,
					shares_held,
					average_cost_basis_per_share,
					last_market_price,
					unrealized_profit_loss,
					status,
					verification_status,
					verified_updated_at
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
				[
					row.id,
					row.memberId,
					row.assetId,
					row.sharesHeld,
					row.averageCostBasisPerShare,
					row.lastMarketPrice,
					row.unrealizedProfitLoss,
					row.status,
					row.verificationStatus
				]
			);
		}

		for (const row of realizedRows) {
			await client.query(
				`INSERT INTO realized_profit_events (
					id,
					member_id,
					asset_id,
					source_transaction_id,
					realized_profit_loss
				)
				VALUES ($1, $2, $3, $4, $5)`,
				[row.id, row.memberId, row.assetId, row.sourceTransactionId, row.realizedProfitLoss]
			);
		}

		for (const row of positionStateRows) {
			await client.query(
				`INSERT INTO position_state_events (
					id,
					source_transaction_id,
					position_status
				)
				VALUES ($1, $2, $3)`,
				[row.id, row.sourceTransactionId, row.positionStatus]
			);
		}

		for (const row of positionChangeRows) {
			await client.query(
				`INSERT INTO position_change_events (
					id,
					member_id,
					asset_id,
					action,
					share_delta,
					realized_profit_loss,
					source_transaction_id
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[row.id, row.memberId, row.assetId, row.action, row.shareDelta, row.realizedProfitLoss, row.sourceTransactionId]
			);
		}

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}

	return {
		holdingRows: holdingRows.length,
		realizedRows: realizedRows.length,
		positionStateRows: positionStateRows.length,
		positionChangeRows: positionChangeRows.length
	};
}

export async function runIngestionWorkerFromCli() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required.");
	}

	const fromYear = Number(parseArgument("from-year", "2019"));
	const toYear = Number(parseArgument("to-year", String(new Date().getUTCFullYear())));
	const mode = parseArgument("mode", "hourly");
	if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || toYear < fromYear) {
		throw new Error("Invalid from-year/to-year values.");
	}
	if (mode !== "hourly" && mode !== "backfill") {
		throw new Error("mode must be either 'hourly' or 'backfill'.");
	}

	const cacheRoot = process.env.RAW_FILING_CACHE_DIRECTORY ?? "/tmp/invest-like-congress/raw-filings";
	await ensureDirectory(cacheRoot);

	const runId = randomUUID();
	const startedAt = new Date().toISOString();
	const warnings = [];
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		const checkpointKey = `${mode}:${fromYear}-${toYear}`;
		const checkpointResult = await client.query(
			`SELECT last_seen_filed_at FROM ingestion_checkpoints WHERE source_system = 'official-ptr' AND cursor_key = $1`,
			[checkpointKey]
		);
		const checkpointDate = checkpointResult.rowCount > 0 ? checkpointResult.rows[0].last_seen_filed_at : null;

		const references = await fetchHouseReferences(fromYear, toYear);
		const senateReferences = await fetchSenateReferences(fromYear, toYear);
		references.push(...senateReferences);
		references.sort((left, right) => {
			const dateOrder = left.filedAt.localeCompare(right.filedAt);
			if (dateOrder !== 0) {
				return dateOrder;
			}
			return left.sourceDocumentId.localeCompare(right.sourceDocumentId);
		});

		let fetchedDocuments = 0;
		let parsedDocuments = 0;
		let quarantinedDocuments = 0;
		let extractedTransactions = 0;
		let provenanceFields = 0;
		let lastSeenFiledAt = checkpointDate ? new Date(checkpointDate).toISOString().slice(0, 10) : null;

		for (const reference of references) {
			if (mode === "hourly" && checkpointDate && new Date(reference.filedAt) <= new Date(checkpointDate)) {
				continue;
			}

			const response = await fetch(reference.documentUrl);
			if (!response.ok) {
				warnings.push(`document-fetch-failure:${reference.sourceDocumentId}:${response.status}`);
				continue;
			}

			const bytes = new Uint8Array(await response.arrayBuffer());
			const contentHash = createHash("sha256").update(bytes).digest("hex");
			const cacheDirectory = path.join(cacheRoot, reference.sourceSystem);
			await ensureDirectory(cacheDirectory);
			const cachePath = path.join(cacheDirectory, `${reference.sourceDocumentId}-${contentHash.slice(0, 10)}.pdf`);
			await fs.writeFile(cachePath, bytes);

			const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
			const parsedText = contentType.includes("html")
				? Buffer.from(bytes).toString("utf8").replaceAll(/<[^>]+>/g, " ")
				: extractPdfText(bytes);
			const candidates = parsePtrCandidatesFromText(parsedText);
			if (candidates.length === 0) {
				quarantinedDocuments += 1;
				await client.query(
					`INSERT INTO ingestion_quarantine_events (id, source_document_id, reason, created_at)
					 VALUES ($1, $2, $3, now())`,
					[randomUUID(), reference.sourceDocumentId, "no-transactions-parsed"]
				);
				continue;
			}

			fetchedDocuments += 1;
			console.info("ingestion-document-fetched", {
				run_id: runId,
				mode,
				source_system: reference.sourceSystem,
				source_document_id: reference.sourceDocumentId,
				checkpoint_key: checkpointKey
			});
			parsedDocuments += 1;
			extractedTransactions += candidates.length;

			await client.query("BEGIN");
			try {
				await client.query(
					`INSERT INTO filing_documents (
						id, source_system, source_document_id, document_url, filed_at, verification_status, ingestion_checksum,
						raw_cache_path, raw_fetched_at, raw_content_hash, compliance_mode
					)
					VALUES ($1, $2, $3, $4, $5, 'verified', $6, $7, now(), $8, $9)
					ON CONFLICT (source_document_id)
					DO UPDATE SET
						document_url = EXCLUDED.document_url,
						filed_at = EXCLUDED.filed_at,
						ingestion_checksum = EXCLUDED.ingestion_checksum,
						raw_cache_path = EXCLUDED.raw_cache_path,
						raw_fetched_at = EXCLUDED.raw_fetched_at,
						raw_content_hash = EXCLUDED.raw_content_hash,
						compliance_mode = EXCLUDED.compliance_mode`,
					[
						reference.sourceDocumentId,
						reference.sourceSystem,
						reference.sourceDocumentId,
						reference.documentUrl,
						reference.filedAt,
						contentHash,
						cachePath,
						contentHash,
						"strict-non-commercial"
					]
				);

				for (const [index, candidate] of candidates.entries()) {
					const memberId = `member-${reference.memberDisplayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "")}`;
					const assetId = `asset-${candidate.assetDisplayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "")}`;
					const sourceTransactionKey = buildSourceTransactionKey(
						memberId,
						assetId,
						candidate.action,
						candidate.tradeDate,
						reference.sourceDocumentId,
						candidate.totalAmountMin,
						candidate.totalAmountMax,
						index
					);

					await client.query(
						`INSERT INTO members (id, full_name, party, state_code, chamber)
						 VALUES ($1, $2, $3, $4, $5)
						 ON CONFLICT (id) DO NOTHING`,
						[memberId, reference.memberDisplayName, "U", "NA", reference.chamber]
					);

					await client.query(
						`INSERT INTO assets (id, display_name, ticker_symbol, asset_type, is_symbol_resolved)
						 VALUES ($1, $2, $3, $4, $5)
						 ON CONFLICT (id)
						 DO UPDATE SET
							ticker_symbol = COALESCE(assets.ticker_symbol, EXCLUDED.ticker_symbol),
							is_symbol_resolved = assets.is_symbol_resolved OR EXCLUDED.is_symbol_resolved`,
						[assetId, candidate.assetDisplayName, candidate.tickerSymbol, "unknown", !!candidate.tickerSymbol]
					);

					const transactionResult = await client.query(
						`INSERT INTO normalized_transactions (
							id, source_transaction_key, member_id, asset_id, action, trade_date, filing_date,
							share_quantity, price_per_share, total_amount_min, total_amount_max, filing_document_id,
							verification_status, is_new_position, parser_confidence, extraction_mode
						)
						VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, $10, 'verified', $11, $12, 'pdf-text')
						ON CONFLICT (source_transaction_key)
						DO UPDATE SET
							trade_date = EXCLUDED.trade_date,
							total_amount_min = EXCLUDED.total_amount_min,
							total_amount_max = EXCLUDED.total_amount_max,
							parser_confidence = EXCLUDED.parser_confidence,
							extraction_mode = EXCLUDED.extraction_mode,
							verification_status = 'verified'
						RETURNING id`,
						[
							randomUUID(),
							sourceTransactionKey,
							memberId,
							assetId,
							candidate.action,
							candidate.tradeDate,
							reference.filedAt,
							candidate.totalAmountMin,
							candidate.totalAmountMax,
							reference.sourceDocumentId,
							candidate.action === "buy",
							0.72
						]
					);

					const transactionId = transactionResult.rows[0].id;
					await client.query(
						"DELETE FROM source_attributions WHERE entity_type = 'normalized-transaction' AND entity_id = $1",
						[transactionId]
					);

					for (const provenance of candidate.provenance) {
						provenanceFields += 1;
						await client.query(
							`INSERT INTO source_attributions (
								id, entity_type, entity_id, field_name, field_value, filing_document_id,
								source_text, source_location, extractor_version, confidence
							)
							VALUES ($1, 'normalized-transaction', $2, $3, $4, $5, $6, $7, 'v2', 0.72)`,
							[
								randomUUID(),
								transactionId,
								provenance.fieldName,
								provenance.fieldValue,
								reference.sourceDocumentId,
								provenance.sourceText,
								provenance.sourceLocation
							]
						);
					}
				}

				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			}

				if (!lastSeenFiledAt || new Date(reference.filedAt).getTime() > new Date(lastSeenFiledAt).getTime()) {
					lastSeenFiledAt = reference.filedAt;
				}
			}

			const derivedRefreshResult = await rebuildDerivedPortfolioState(client);
			await persistCheckpoint(client, "official-ptr", checkpointKey, lastSeenFiledAt);
			await client.query("UPDATE system_status SET last_ingestion_at = now() WHERE id = 1");

		const provenanceCoverageRatio = extractedTransactions > 0 ? provenanceFields / extractedTransactions : 0;
		await persistRunSummary(client, {
			runId,
			mode,
			cursorKey: checkpointKey,
			fromYear,
			toYear,
			startedAt,
			finishedAt: new Date().toISOString(),
			success: true,
			failureReason: null,
			fetchedDocuments,
			parsedDocuments,
			quarantinedDocuments,
			extractedTransactions,
			provenanceCoverageRatio,
			warnings
		});
			console.info("[ingestion] completed", {
			runId,
			mode,
			fromYear,
			toYear,
			fetchedDocuments,
			parsedDocuments,
			quarantinedDocuments,
				extractedTransactions,
				provenanceCoverageRatio,
				derivedRefreshResult,
				warnings
			});
	} catch (error) {
		await persistRunSummary(client, {
			runId,
			mode,
			cursorKey: `${mode}:${fromYear}-${toYear}`,
			fromYear,
			toYear,
			startedAt,
			finishedAt: new Date().toISOString(),
			success: false,
			failureReason: error instanceof Error ? error.message : String(error),
			fetchedDocuments: 0,
			parsedDocuments: 0,
			quarantinedDocuments: 0,
			extractedTransactions: 0,
			provenanceCoverageRatio: 0,
			warnings
		});
		throw error;
	} finally {
		await client.end();
	}
}
