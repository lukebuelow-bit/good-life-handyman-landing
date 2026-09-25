function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isZip(value) {
  return /^\d{5}(?:-\d{4})?$/.test(value);
}

function resolveName(body) {
  const first = clean(body.first);
  const last = clean(body.last);
  const name = clean(body.name);

  if (first || last) {
    return {
      entered: [first, last].filter(Boolean).join(" "),
      first_name: first,
      last_name: last
    };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { entered: "", first_name: "", last_name: "" };
  }

  return {
    entered: name,
    first_name: parts[0],
    last_name: parts.slice(1).join(" ")
  };
}

function resolveLocation(body) {
  const street = clean(body.address);
  let city = clean(body.city);
  let zip = clean(body.zip);
  const cityOrZip = clean(body.cityOrZip);

  if (cityOrZip) {
    if (isZip(cityOrZip)) {
      if (!zip) zip = cityOrZip;
    } else if (!city) {
      city = cityOrZip;
    }
  }

  return {
    street,
    city,
    zip,
    label: cityOrZip || [city, zip].filter(Boolean).join(" ")
  };
}

// Housecall Pro Create Lead accepts a customer with first_name, last_name,
// mobile_number, optional email, notes, and addresses[{street,city,state,zip}].
// The shortened form collects one name, one phone, one city-or-ZIP, and the list.
// https://docs.housecallpro.com/docs/housecall-public-api/8961eaf9f1c28-create-lead
export function buildHcpLead(body) {
  const source = body || {};
  const person = resolveName(source);
  const phone = clean(source.phone);
  const email = clean(source.email);
  const projectList = clean(source.projectList);
  const preferredDay = clean(source.preferredDay);
  const preferredTime = clean(source.preferredTime);
  const location = resolveLocation(source);

  if (!person.first_name || !phone || !location.label) {
    return {
      ok: false,
      error: "Name, phone, and city or ZIP are required."
    };
  }

  const summary = [
    "THE UNFINISHED LIST — HANDYMAN IN-HOME QUOTE",
    "",
    "Source: Good Life Handyman Landing Page",
    "",
    `Name: ${person.entered}`,
    `Projects / unfinished list: ${projectList || "Not provided"}`,
    `City or ZIP: ${location.label}`,
    location.street ? `Submitted address: ${location.street}` : "Street address: not collected",
    ...(preferredDay ? [`Preferred day: ${preferredDay}`] : []),
    ...(preferredTime ? [`Preferred time: ${preferredTime}`] : []),
    "",
    "Campaign: The Unfinished List",
    "CTA: Book Your In-Home Quote"
  ].join("\n");

  const customer = {
    first_name: person.first_name,
    mobile_number: phone,
    notes: summary
  };

  // A single given name has no last name. Send a non-empty last_name so HCP
  // does not reject the customer, and keep the typed name in notes.
  customer.last_name = person.last_name || "-";

  if (email) customer.email = email;

  const address = { state: "CO" };
  if (location.street) address.street = location.street;
  if (location.city) address.city = location.city;
  if (location.zip) address.zip = location.zip;

  // No street is collected anymore. Repeat the city or ZIP as the street line
  // so the address object HCP accepts is not submitted with a blank street.
  if (!address.street) address.street = location.label;

  customer.addresses = [address];

  return { ok: true, customer };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  console.log("HCP_API_KEY present:", !!process.env.HCP_API_KEY);
  if (!process.env.HCP_API_KEY) return res.status(500).json({ ok: false, error: "HCP_API_KEY is missing" });

  const built = buildHcpLead(req.body || {});
  if (!built.ok) return res.status(400).json({ ok: false, error: built.error });

  try {
    const response = await fetch("https://api.housecallpro.com/leads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HCP_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ customer: built.customer })
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      console.error("HCP HANDYMAN LEAD REJECTED:", response.status, data);
      return res.status(response.status).json({ ok: false, error: "Housecall Pro rejected the lead.", hcpStatus: response.status });
    }
    console.log("HCP HANDYMAN LEAD CREATED:", { status: response.status, leadId: data?.id || null, customerId: data?.customer?.id || null });
    return res.status(200).json({ ok: true, message: "Handyman quote request created successfully.", leadId: data?.id || null });
  } catch (error) {
    console.error("HCP HANDYMAN LEAD ERROR:", error);
    return res.status(500).json({ ok: false, error: "Unable to create handyman quote request." });
  }
}
