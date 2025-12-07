import { Outlet } from "react-router";
import { UserButton } from "@sabaipics/auth/react";

export function Layout() {
	return (
		<div className="min-h-screen">
			<header className="border-b px-4 py-3 flex justify-between items-center">
				<h1 className="font-semibold">SabaiPics</h1>
				<UserButton afterSignOutUrl="/sign-in" />
			</header>
			<main className="p-4">
				<Outlet />
			</main>
		</div>
	);
}
