import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
	title: "Congress Portfolio Tracker",
	description: "Verified congressional portfolio holdings and alerts"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<div className="page-shell">
					<header>
						<div>
							<h1>Congress Portfolio Tracker</h1>
							<p>Verified-only disclosures from official House and Senate filings</p>
						</div>
						<nav>
							<Link href="/">Members</Link>
							<Link href="/assets">Assets</Link>
							<Link href="/admin/quarantine">Quarantine</Link>
						</nav>
					</header>
					<main>{children}</main>
				</div>
			</body>
		</html>
	);
}
