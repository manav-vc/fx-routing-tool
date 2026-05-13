import { z } from "zod";
import { quoteOrder } from "@/lib/routing/quote-service";

const quoteRequestSchema = z.object({
  source: z.string().min(3).max(5),
  target: z.string().min(3).max(5),
  amount: z.number().positive().finite(),
  railMode: z.enum(["all", "fiat_only"]),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = quoteRequestSchema.parse(body);
    const response = await quoteOrder(parsed);

    return Response.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { message: "Invalid quote request", issues: error.issues },
        { status: 400 },
      );
    }

    return Response.json(
      { message: error instanceof Error ? error.message : "Unexpected quote error" },
      { status: 500 },
    );
  }
}
