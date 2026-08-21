GOOD LIFE WATER LANDING PAGE V2.1

ADDED
- Fully custom Water Health Review request form.
- Dedicated /thank-you.html page.
- What-to-Expect video placeholder on thank-you page.
- Secure Vercel API route placeholder at /api/hcp-lead.
- HCP API key expected ONLY as Vercel environment variable HCP_API_KEY.

IMPORTANT SAFETY GATE
The server route does not send live data into Housecall Pro yet.
Housecall Pro's official docs confirm that a Lead is the right object for prospective work
and that an associated Customer is required, but the exact current Create Lead request body
still needs to be confirmed before enabling writes.

NEXT
1. Deploy V2.1 to Vercel.
2. Add HCP_API_KEY in Vercel Project Settings > Environment Variables.
3. Confirm Create Lead schema from HCP official docs/support.
4. Enable API route.
5. Submit a test lead and verify it enters the correct HCP lead/Pipeline path.
