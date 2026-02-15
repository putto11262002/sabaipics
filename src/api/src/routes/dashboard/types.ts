export type DashboardEvent = {
  id: string;
  name: string;
  photoCount: number;
  faceCount: number;
  createdAt: string;
  expiresAt: string;
  startDate: string | null;
  endDate: string | null;
};

export type DashboardResponse = {
  credits: {
    balance: number;
    nearestExpiry: string | null;
  };
  events: DashboardEvent[];
  stats: {
    totalPhotos: number;
    totalFaces: number;
  };
};
