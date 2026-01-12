import { Card, CardContent } from "@sabaipics/ui/components/card";
import { Calendar } from "lucide-react";

export default function EventFacesTab() {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Calendar className="size-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Face Recognition Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              This feature will be available in a future update
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
