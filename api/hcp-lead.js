export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed"});
 console.log("HCP_API_KEY present:", !!process.env.HCP_API_KEY);
 if(!process.env.HCP_API_KEY)return res.status(500).json({ok:false,error:"HCP_API_KEY is missing"});
 const {first,last,phone,email,address,city,zip,projectList,preferredDay,preferredTime}=req.body||{};
 if(!first||!last||!phone)return res.status(400).json({ok:false,error:"First name, last name, and phone are required."});
 try{
  const summary=["THE UNFINISHED LIST — HANDYMAN IN-HOME QUOTE","","Source: Good Life Handyman Landing Page","",`Projects / unfinished list: ${projectList||"Not provided"}`,`Preferred day: ${preferredDay||"Flexible / not provided"}`,`Preferred time: ${preferredTime||"Not provided"}`,"",`Submitted address: ${address||"Not provided"}`,`City: ${city||"Not provided"}`,`ZIP: ${zip||"Not provided"}`,"","Campaign: The Unfinished List","CTA: Book Your In-Home Quote"].join("\n");
  const customer={first_name:first.trim(),last_name:last.trim(),mobile_number:phone.trim(),notes:summary};
  if(email&&email.trim())customer.email=email.trim();
  if((address&&address.trim())||(city&&city.trim())||(zip&&zip.trim()))customer.addresses=[{street:address?address.trim():"",city:city?city.trim():"",state:"CO",zip:zip?zip.trim():""}];
  const response=await fetch("https://api.housecallpro.com/leads",{method:"POST",headers:{Authorization:`Bearer ${process.env.HCP_API_KEY}`,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({customer})});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
  if(!response.ok){console.error("HCP HANDYMAN LEAD REJECTED:",response.status,data);return res.status(response.status).json({ok:false,error:"Housecall Pro rejected the lead.",hcpStatus:response.status})}
  console.log("HCP HANDYMAN LEAD CREATED:",{status:response.status,leadId:data?.id||null,customerId:data?.customer?.id||null});
  return res.status(200).json({ok:true,message:"Handyman quote request created successfully.",leadId:data?.id||null});
 }catch(error){console.error("HCP HANDYMAN LEAD ERROR:",error);return res.status(500).json({ok:false,error:"Unable to create handyman quote request."})}
}
