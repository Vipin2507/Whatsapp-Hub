import { useState } from "react";
import { UserPlus, Key, Loader2, User, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface AdminUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminUserModal({ isOpen, onClose }: AdminUserModalProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.admin.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("New operator authorized in the matrix");
      setUsername(""); 
      setPassword("");
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to initialize user");
    }
  });

  const handleCreate = () => {
    if (!username || password.length < 6) {
      return toast.error("Credentials must meet security protocols (Min 6 chars)");
    }
    createMutation.mutate({ username, password });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl font-black uppercase tracking-tight text-foreground">
            Authorize New User
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground text-[10px] font-black uppercase tracking-widest">
            Injecting additional access nodes into the Buildesk Matrix
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 tracking-widest">Account Username</label>
            <div className="relative group">
              <User className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: agent_01"
                className="pl-10 h-12 bg-secondary/50 border-border rounded-2xl text-foreground placeholder:text-muted-foreground/50 font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 tracking-widest">Access Password</label>
            <div className="relative group">
              <Key className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 bg-secondary/50 pl-10 pr-10 font-bold text-foreground placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="bg-amber/10 border border-amber/20 p-4 rounded-2xl flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber shrink-0" />
            <p className="text-[9px] text-amber/90 font-bold uppercase leading-relaxed">
              Security Protocol: Ensure the password is unique. New users will be granted full CRM privileges immediately.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95"
          >
            {createMutation.isPending ? <Loader2 className="animate-spin" /> : "Generate Credentials"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}