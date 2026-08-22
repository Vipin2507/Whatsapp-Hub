import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: Route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Not found</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">This page doesn’t exist</h1>
        <p className="mt-1 text-xs text-muted-foreground">{location.pathname}</p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Home className="h-3.5 w-3.5" />
            Back to workspace
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
