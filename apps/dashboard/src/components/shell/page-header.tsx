import * as React from "react";

import { Separator } from "@sabaipics/ui/components/separator";
import { SidebarTrigger } from "@sabaipics/ui/components/sidebar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@sabaipics/ui/components/breadcrumb";

interface BreadcrumbItem {
	label: string;
	href?: string;
}

interface PageHeaderProps {
	breadcrumbs?: BreadcrumbItem[];
	children?: React.ReactNode;
}

export function PageHeader({ breadcrumbs = [], children }: PageHeaderProps) {
	return (
		<header className="flex h-16 shrink-0 items-center gap-2">
			<div className="flex items-center gap-2 px-4">
				<SidebarTrigger className="-ml-1 md:hidden" />
				<Separator
					orientation="vertical"
					className="mr-2 md:hidden data-[orientation=vertical]:h-4"
				/>
				{breadcrumbs.length > 0 && (
					<Breadcrumb>
						<BreadcrumbList>
							{breadcrumbs.map((item, index) => (
								<React.Fragment key={item.label}>
									{index > 0 && (
										<BreadcrumbSeparator className="hidden md:block" />
									)}
									<BreadcrumbItem
										className={index < breadcrumbs.length - 1 ? "hidden md:block" : ""}
									>
										{item.href ? (
											<BreadcrumbLink href={item.href}>
												{item.label}
											</BreadcrumbLink>
										) : (
											<BreadcrumbPage>{item.label}</BreadcrumbPage>
										)}
									</BreadcrumbItem>
								</React.Fragment>
							))}
						</BreadcrumbList>
					</Breadcrumb>
				)}
			</div>
			{children && (
				<div className="ml-auto flex items-center gap-2 px-4">{children}</div>
			)}
		</header>
	);
}
