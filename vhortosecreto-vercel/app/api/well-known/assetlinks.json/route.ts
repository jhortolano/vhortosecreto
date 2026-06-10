import { NextResponse } from "next/server";

export async function GET() {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.termibululu.vhortosecreto",
        sha256_cert_fingerprints: [
          "F4:D1:C4:0E:18:FC:71:94:43:1D:8E:44:06:76:9C:82:DF:A5:BA:8F:F8:AC:94:1D:61:45:3A:EE:41:8A:36:C8",
        ],
      },
    },
  ];

  return NextResponse.json(assetlinks);
}
