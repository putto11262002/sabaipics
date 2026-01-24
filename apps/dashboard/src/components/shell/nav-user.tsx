import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth, useClerk, useUser } from "@sabaipics/auth/react";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@sabaipics/uiv2/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@sabaipics/uiv2/components/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@sabaipics/uiv2/components/sidebar";

export function NavUser() {
	const { isMobile } = useSidebar();
	const { user } = useUser();
	const { signOut } = useAuth();
	const { openUserProfile } = useClerk();
	const navigate = useNavigate();

	const displayName =
		user?.fullName || user?.emailAddresses[0]?.emailAddress || "User";
	const email = user?.emailAddresses[0]?.emailAddress || "";
	const avatarUrl = user?.imageUrl || "";
	const initials = displayName
		.split(" ")
		.map((n: string) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const handleSignOut = async () => {
		await signOut();
		navigate("/sign-in", { replace: true });
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={avatarUrl} alt={displayName} />
								<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{displayName}</span>
								<span className="truncate text-xs text-muted-foreground">
									{email}
								</span>
							</div>
							<ChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={avatarUrl} alt={displayName} />
									<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{displayName}</span>
									<span className="truncate text-xs text-muted-foreground">
										{email}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => openUserProfile()}>
							<Settings />
							Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleSignOut}>
							<LogOut />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
