import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  // Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (activeTab === "login") {
        await signIn.email({
          email: email.trim(),
          password: password,
          callbackURL: window.location.href,
          fetchOptions: {
            onError: (ctx) => {
              toast.error(ctx.error.message || "Failed to sign in.");
              setLoading(false);
            },
            onSuccess: () => {
              toast.success("Successfully logged in!");
              onOpenChange(false);
              setLoading(false);
            },
          },
        });
      } else {
        if (!name.trim()) {
          toast.error("Please enter your name.");
          setLoading(false);
          return;
        }
        await signUp.email({
          email: email.trim(),
          password: password,
          name: name.trim(),
          callbackURL: window.location.href,
          fetchOptions: {
            onError: (ctx) => {
              toast.error(ctx.error.message || "Failed to sign up.");
              setLoading(false);
            },
            onSuccess: () => {
              toast.success("Account created successfully!");
              onOpenChange(false);
              setLoading(false);
            },
          },
        });
      }
    } catch (err: unknown) {
      console.error("[auth] Submission error:", err);
      toast.error("An unexpected authentication error occurred.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[390px] border border-border bg-card/95 backdrop-blur-md text-foreground">
        <DialogHeader className="flex flex-col items-center text-center space-y-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl font-bold uppercase tracking-wider">
            Crypto Compass
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sign in to track positions backed by Neon Serverless Cloud database.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "login" | "signup")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/20 border border-border/40 p-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider">
            <TabsTrigger value="login" disabled={loading} className="rounded-md py-1">
              Log In
            </TabsTrigger>
            <TabsTrigger value="signup" disabled={loading} className="rounded-md py-1">
              Sign Up
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <TabsContent value="signup" className="space-y-3 m-0">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Display Name
                </Label>
                <Input
                  type="text"
                  placeholder="Trader Joe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required={activeTab === "signup"}
                  className="bg-background/40 border border-border/60 focus:border-primary"
                />
              </div>
            </TabsContent>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Email Address
                </Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="bg-background/40 border border-border/60 focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Password
                </Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="bg-background/40 border border-border/60 focus:border-primary"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 font-bold uppercase tracking-widest text-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                </>
              ) : activeTab === "login" ? (
                "Log In"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-border/40"></div>
            <span className="flex-shrink mx-3 text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">
              Or continue with
            </span>
            <div className="flex-grow border-t border-border/40"></div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await signIn.social({
                  provider: "google",
                  callbackURL: window.location.href,
                });
              } catch (err: unknown) {
                console.error("[auth] Google sign in failed:", err);
                const message =
                  err instanceof Error ? err.message : "Failed to sign in with Google.";
                toast.error(message);
                setLoading(false);
              }
            }}
            className="w-full h-9 border border-border bg-background/50 text-xs font-semibold uppercase tracking-wider hover:bg-accent text-foreground gap-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.99 1 12 1 7.24 1 3.2 3.73 1.24 7.74l3.86 3c.92-2.77 3.5-4.7 6.9-4.7z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.44c-.28 1.46-1.1 2.7-2.33 3.53l3.6 2.79c2.1-1.94 3.78-4.79 3.78-8.47z"
              />
              <path
                fill="#FBBC05"
                d="M5.1 14.74c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.24 7.74C.45 9.36 0 11.13 0 13s.45 3.64 1.24 5.26l3.86-3.02z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.6-2.79c-1.1.74-2.52 1.18-4.36 1.18-3.4 0-5.98-1.93-6.9-4.7l-3.86 3.02C3.2 20.27 7.24 23 12 23z"
              />
            </svg>
            Google
          </Button>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
