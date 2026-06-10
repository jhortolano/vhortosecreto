import { NextResponse } from "next/server";

export async function GET() {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appID: "VY93Z2D6Y4.com.termibululu.vhortosecreto",
          paths: ["/open/*"],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(aasa, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
