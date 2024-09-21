import { NextResponse } from "next/server";
import { AxiomRequest, withAxiom } from "next-axiom";

export const GET = withAxiom((req: AxiomRequest) => {
  req.log.info("Axiom Test");
  return NextResponse.json({ hello: "world" });
});
