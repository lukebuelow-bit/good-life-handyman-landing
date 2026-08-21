GOOD LIFE WATER LANDING PAGE V2.2

WHAT CHANGED
- Fixed the V2.1 runtime issues in the packaged source.
- Embedded Amy Hendricks' uploaded testimonial video directly in the landing page.
- Kept the custom, water-specific $49 review request form.
- Preserved the dedicated thank-you page.
- Refined the thank-you page's What-to-Expect video slot for Luke's upcoming recording.
- Preserved the secure server-side /api/hcp-lead route and HCP_API_KEY environment-variable architecture.

CURRENT API STATUS
The landing page form is intentionally not writing live leads into Housecall Pro yet.
The secure backend route remains gated until the exact current HCP Create Lead request schema is confirmed.
Do not put the HCP API key in React code or share it in chat.

NEXT MILESTONE
1. Run V2.2 locally and review Amy's testimonial + form.
2. Deploy V2.2 to Vercel.
3. Add HCP_API_KEY privately in Vercel Project Settings > Environment Variables.
4. Activate/verify the HCP lead-write route.
5. Send one dummy lead and confirm it lands in HCP correctly.
6. Add analytics/conversion tracking.
