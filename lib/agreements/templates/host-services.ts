import type { Template } from "@/lib/agreements/types";
import { BODY } from "@/lib/agreements/templates/host-services.text";

export const HOST_SERVICES: Template = {
  kind: "host_services",
  version: "hsa-2026-11",
  title: "Host Services Agreement",
  parties: ["host", "joeyco"],
  body: BODY,
  fields: [
    { key: "effective_date", label: "Effective date", type: "date", group: "Agreement", required: true, prefill: "today" },
    { key: "host_name", label: "Your full legal name", type: "text", group: "Agreement", required: true, prefill: "host_name" },
    {
      key: "host_address",
      label: "Your address",
      type: "text",
      group: "Agreement",
      required: true,
      help: "The home a Joey would live in. We'll use it to fill in your Joey agreements.",
    },
  ],
};
