import test from "node:test";
import assert from "node:assert/strict";

function computeFifo(transactions) {
	const lots = [];
	let realizedProfitLoss = 0;

	for (const transaction of transactions) {
		if (transaction.action === "buy") {
			lots.push({ shares: transaction.shares, costBasis: transaction.price });
			continue;
		}

		let remaining = transaction.shares;
		while (remaining > 0 && lots.length > 0) {
			const lot = lots[0];
			const sellSize = Math.min(lot.shares, remaining);
			realizedProfitLoss += sellSize * (transaction.price - lot.costBasis);
			lot.shares -= sellSize;
			remaining -= sellSize;
			if (lot.shares === 0) {
				lots.shift();
			}
		}
	}

	const remainingShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
	return { remainingShares, realizedProfitLoss };
}

test("FIFO math computes realized P/L for partial sell", () => {
	const result = computeFifo([
		{ action: "buy", shares: 10, price: 100 },
		{ action: "buy", shares: 10, price: 110 },
		{ action: "sell", shares: 12, price: 130 }
	]);

	assert.equal(result.remainingShares, 8);
	assert.equal(result.realizedProfitLoss, 340);
});

test("FIFO math handles full exit", () => {
	const result = computeFifo([
		{ action: "buy", shares: 5, price: 200 },
		{ action: "sell", shares: 5, price: 250 }
	]);

	assert.equal(result.remainingShares, 0);
	assert.equal(result.realizedProfitLoss, 250);
});
