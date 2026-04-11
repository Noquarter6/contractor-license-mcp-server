import type { z } from "zod";
import type { StatesInputSchema } from "../schemas.js";
import { formatStatesList } from "../format.js";
import type { StateInfo } from "../types.js";

// Hardcoded until backend exposes a /states endpoint.
// Last updated: 2026-03-27 — 43 working states.
const SUPPORTED_STATES: StateInfo[] = [
  { code: "AK", name: "Alaska", portal: "https://www.commerce.alaska.gov/", status: "healthy", trades: ["general", "electrical", "mechanical"] },
  { code: "AL", name: "Alabama", portal: "https://genconbd.alabama.gov/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac", "residential"] },
  { code: "AR", name: "Arkansas", portal: "https://www.aclb.arkansas.gov/", status: "healthy", trades: ["general"] },
  { code: "AZ", name: "Arizona", portal: "https://azroc.my.site.com/AZRoc/s/contractor-search", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "CA", name: "California", portal: "https://www.cslb.ca.gov/onlineservices/checkalicense/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "CO", name: "Colorado", portal: "https://apps2.colorado.gov/dora/licensing/lookup/", status: "healthy", trades: ["electrical", "plumbing"] },
  { code: "CT", name: "Connecticut", portal: "https://elicense.ct.gov/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "DC", name: "District of Columbia", portal: "https://dcra.dc.gov/", status: "healthy", trades: ["general"] },
  { code: "DE", name: "Delaware", portal: "https://delpros.delaware.gov/", status: "healthy", trades: ["electrical", "plumbing", "hvac"] },
  { code: "FL", name: "Florida", portal: "https://www.myfloridalicense.com/wl11.asp", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "GA", name: "Georgia", portal: "https://goals.sos.ga.gov/", status: "degraded", trades: ["general"] },
  { code: "HI", name: "Hawaii", portal: "https://mypvl.dcca.hawaii.gov/", status: "healthy", trades: ["general"] },
  { code: "IA", name: "Iowa", portal: "https://dps-eeb.my.site.com/", status: "healthy", trades: ["electrical"] },
  { code: "ID", name: "Idaho", portal: "https://dopl.idaho.gov/", status: "healthy", trades: ["electrical", "plumbing", "hvac"] },
  { code: "IL", name: "Illinois", portal: "https://idfpr.illinois.gov/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "IN", name: "Indiana", portal: "https://mylicense.in.gov/", status: "healthy", trades: ["plumbing"] },
  { code: "KY", name: "Kentucky", portal: "https://dhbc.ky.gov/", status: "healthy", trades: ["general", "electrical", "hvac", "plumbing"] },
  { code: "LA", name: "Louisiana", portal: "https://arlspublic.lslbc.louisiana.gov/", status: "healthy", trades: ["general"] },
  { code: "MA", name: "Massachusetts", portal: "https://www.mass.gov/", status: "healthy", trades: ["general", "mechanical"] },
  { code: "MD", name: "Maryland", portal: "https://labor.maryland.gov/", status: "healthy", trades: ["general", "hvac", "electrical", "plumbing"] },
  { code: "ME", name: "Maine", portal: "https://pfr.maine.gov/", status: "healthy", trades: ["electrical", "plumbing"] },
  { code: "MI", name: "Michigan", portal: "https://aca-prod.accela.com/LARA/", status: "healthy", trades: ["electrical", "plumbing", "hvac"] },
  { code: "MN", name: "Minnesota", portal: "https://ims.dli.mn.gov/", status: "healthy", trades: ["general", "electrical", "plumbing"] },
  { code: "MS", name: "Mississippi", portal: "https://www.msboc.us/", status: "healthy", trades: ["general"] },
  { code: "NC", name: "North Carolina", portal: "https://www.nclbgc.org/", status: "healthy", trades: ["general"] },
  { code: "ND", name: "North Dakota", portal: "https://firststop.sos.nd.gov/", status: "healthy", trades: ["general", "electrical"] },
  { code: "NE", name: "Nebraska", portal: "https://dol.nebraska.gov/conreg/", status: "healthy", trades: ["general", "electrical"] },
  { code: "NH", name: "New Hampshire", portal: "https://forms.nh.gov/licenseverification/", status: "healthy", trades: ["electrical", "plumbing"] },
  { code: "NJ", name: "New Jersey", portal: "https://newjersey.mylicense.com/verification/", status: "healthy", trades: ["general", "electrical", "hvac", "plumbing"] },
  { code: "NM", name: "New Mexico", portal: "https://public.psiexams.com/search.jsp", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "NV", name: "Nevada", portal: "https://app.nvcontractorsboard.com/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "NY", name: "New York", portal: "https://www.dos.ny.gov/licensing/", status: "healthy", trades: ["home_inspection"] },
  { code: "OH", name: "Ohio", portal: "https://elicense.ohio.gov/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "OK", name: "Oklahoma", portal: "https://www.ok.gov/cib/", status: "healthy", trades: ["electrical", "plumbing", "hvac"] },
  { code: "OR", name: "Oregon", portal: "https://search.ccb.state.or.us/search/", status: "healthy", trades: ["general"] },
  { code: "PA", name: "Pennsylvania", portal: "https://www.pals.pa.gov/", status: "healthy", trades: ["general", "electrical", "hvac", "plumbing"] },
  { code: "RI", name: "Rhode Island", portal: "https://www.crb.ri.gov/", status: "healthy", trades: ["general"] },
  { code: "SC", name: "South Carolina", portal: "https://verify.llronline.com/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "TN", name: "Tennessee", portal: "https://verify.tn.gov/", status: "healthy", trades: ["general", "electrical", "plumbing"] },
  { code: "TX", name: "Texas", portal: "https://www.tdlr.texas.gov/LicenseSearch/", status: "healthy", trades: ["hvac", "electrical", "plumbing"] },
  { code: "UT", name: "Utah", portal: "https://secure.utah.gov/llv/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "VA", name: "Virginia", portal: "https://dporweb.dpor.virginia.gov/", status: "healthy", trades: ["general", "electrical", "plumbing", "hvac"] },
  { code: "VT", name: "Vermont", portal: "https://sos.vermont.gov/opr/", status: "healthy", trades: ["electrical", "plumbing"] },
  { code: "WA", name: "Washington", portal: "https://secure.lni.wa.gov/verify/", status: "healthy", trades: ["general"] },
  { code: "WV", name: "West Virginia", portal: "https://wvclboard.wv.gov/", status: "healthy", trades: ["general", "electrical", "hvac", "plumbing"] },
];

type StatesInput = z.output<typeof StatesInputSchema>;

export async function handleListStates(
  args: StatesInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const format = args.response_format ?? "markdown";
  return {
    content: [
      { type: "text", text: formatStatesList(SUPPORTED_STATES, format) },
    ],
  };
}
