import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Lock, User, ShieldCheck, Sun, Moon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const formSchema = z.object({
  username: z.string().min(2, { message: "Username must be at least 2 characters." }),
  password: z.string().min(4, { message: "Password must be at least 4 characters." }),
});

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  // Initialize state from localStorage to prevent "flicker"
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("theme") === "dark" ||
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  // Apply theme class to <html> element
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const from = location.state?.from?.pathname || "/";

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        toast.success("Welcome back, " + data.user.username);
        navigate(from, { replace: true });
      } else {
        toast.error(data.message || "Authentication failed: Check credentials");
      }
    } catch (error) {
      toast.error("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground transition-colors duration-500 p-4 relative overflow-hidden">

      <Button variant="outline" size="icon" className="fixed top-6 right-6 rounded-full z-50 border-border bg-card hover:bg-secondary transition-all active:scale-90 shadow-lg" onClick={() => setIsDark(!isDark)}>
        {isDark ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-600" />}
      </Button>

      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo to-emerald opacity-80" />

      <Card className="w-full max-w-md border border-border/50 shadow-xl rounded-2xl overflow-hidden bg-card/80 backdrop-blur-xl relative z-10 transition-colors duration-300">
        <CardHeader className="space-y-2 text-center pt-10 pb-2">
          <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20">
            <ShieldCheck className="text-primary w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Buildesk <span className="text-primary">CRM</span></CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-sm font-medium text-foreground">Username</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Enter username" className="pl-10 h-11 bg-muted/30 border-border rounded-xl" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-sm font-medium text-foreground">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="password" placeholder="••••••••" className="pl-10 h-11 bg-muted/30 border-border rounded-xl" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <Button type="submit" className="w-full h-12 font-semibold rounded-xl" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : "Sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="pb-6 justify-center border-t border-border/30 pt-4">
          <p className="text-xs text-muted-foreground flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Secure connection</p>
        </CardFooter>
      </Card>

      <div className="fixed -bottom-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -z-10" />
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-indigo/5 rounded-full blur-[120px] -z-10" />
    </div>
  );
};

export default Login;