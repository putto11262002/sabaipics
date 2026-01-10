import { z } from "zod";

export const eventFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Event name is required")
      .max(200, "Event name must be 200 characters or less"),
    startDate: z.string().datetime().optional().or(z.literal("")),
    endDate: z.string().datetime().optional().or(z.literal("")),
  })
  .refine(
    (data: { name: string; startDate?: string; endDate?: string }) => {
      // If both dates are provided and not empty, validate the range
      if (data.startDate && data.endDate && data.startDate !== "" && data.endDate !== "") {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    {
      message: "End date must be after or equal to start date",
      path: ["endDate"],
    }
  );

export type EventFormData = z.infer<typeof eventFormSchema>;
