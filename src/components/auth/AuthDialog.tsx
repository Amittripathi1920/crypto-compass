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
            }
          }
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
            }
          }
        });
      }
    } catch (err: any) {
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
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

            <Button type="submit" disabled={loading} className="w-full mt-2 font-bold uppercase tracking-widest text-xs">
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
