import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { BrandedLoader } from "@/components/BrandedLoader";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    const skip =
      typeof sessionStorage !== "undefined" && sessionStorage.getItem("skip-loader") === "1";
    if (skip) {
      sessionStorage.removeItem("skip-loader");
      return <div className="h-screen w-full bg-background" />;
    }
    return <BrandedLoader />;
  }

  if (!data?.logged_in) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
