import { z } from "zod";

import { PLATFORM_VALUES } from "../types";

export const tcpPortSchema = z.number().int().min(1).max(65_535);

export const mdnsTxtSchema = z.object({
  device_id: z.string().min(1),
  alias: z.string(),
  platform: z.enum(PLATFORM_VALUES),
});
