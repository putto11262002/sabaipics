import { useQuery } from "@tanstack/react-query";
import { Button } from "@sabaipics/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sabaipics/ui/components/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@sabaipics/ui/components/alert";
import { api } from "./lib/api";

function App() {
  const {
    data: health,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.$get();
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-semibold">SabaiPics Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              API: {isLoading ? "..." : error ? "offline" : health?.status}
            </span>
            <Button variant="outline">Sign In</Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Welcome to SabaiPics</h2>
          <p className="text-muted-foreground">Manage your events and photos</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>List of events</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Hello</p>
          </CardContent>
        </Card>
        <Alert>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            This is a warning alert — check it out!
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}

export default App;
