import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: Route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-6">This page doesn't exist or was moved.</p>
        <Link to="/">
          <Button className="gap-2 rounded-xl">
            <Home className="w-4 h-4" /> Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
