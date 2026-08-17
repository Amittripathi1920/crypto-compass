import { signOut, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, User } from "lucide-react";

export function UserNav() {
  const { data: sessionData } = useSession();

  if (!sessionData?.user) return null;
  const { user } = sessionData;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : user.email.substring(0, 2).toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            toast.success("Successfully logged out.");
            window.location.reload();
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Failed to log out.");
          },
        },
      });
    } catch (e) {
      console.error("[auth] Log out error:", e);
      toast.error("An unexpected error occurred during logout.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full border border-border/80 bg-background/50 hover:bg-accent"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-bold uppercase text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 border border-border bg-card text-foreground"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5 p-1">
            <p className="text-sm font-bold leading-none text-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" /> {user.name}
            </p>
            <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/60" />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-bear hover:bg-bear/10 hover:text-bear cursor-pointer flex items-center gap-2 text-xs font-semibold uppercase tracking-wider p-2.5"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
