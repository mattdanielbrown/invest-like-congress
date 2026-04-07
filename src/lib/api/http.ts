import { NextResponse } from "next/server";

export function okJson(data: unknown, init?: ResponseInit) {
	return NextResponse.json(data, {
		status: 200,
		...init
	});
}

export function badRequest(message: string) {
	return NextResponse.json(
		{ error: message },
		{ status: 400 }
	);
}

export function notFound(message: string) {
	return NextResponse.json(
		{ error: message },
		{ status: 404 }
	);
}

export function internalError(message: string) {
	return NextResponse.json(
		{ error: message },
		{ status: 500 }
	);
}
