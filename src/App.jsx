import React,{useState} from 'react';
import {ArrowRight,Check,Wrench,ShieldCheck,Home,ClipboardList,ChevronDown,MapPin,Phone,Hammer,Paintbrush,DoorOpen} from 'lucide-react';

const facts=[
 [ClipboardList,'Walk the real list','We look at the actual projects in your home—not a generic menu of services.'],
 [Wrench,'Professional handyman team','Repairs and finish work handled by a real home-service company.'],
 [ShieldCheck,'Clear scope and price','We gather the details, then build a straightforward quote for the work.'],
 [Home,'One Good Life team','Handyman service backed by licensed plumbing capability when the job crosses trades.']
];

const services=[
 [Paintbrush,'Drywall & finish repairs','Holes, visible patches, texture issues, trim and the finish work that keeps catching your eye.'],
 [DoorOpen,'Doors, trim & interior repairs','Doors that need adjustment, loose trim, hardware, small repairs and installations.'],
 [Hammer,'Half-finished projects','Projects that got started, stalled out, or turned into more work than expected.'],
 [ClipboardList,'The whole unfinished list','Bring the collection of smaller jobs that never seem big enough for a remodeler—but still need to get done.']
];

const faqs=[
 ['What happens during the in-home quote?','We walk the actual projects with you, gather the scope, measurements, photos and relevant conditions, then build and present a clear quote for the work.'],
 ['Is the quote free?','We do not advertise this as a free quote. Our office will explain any applicable visit or dispatch fee during booking and how it applies to approved work.'],
 ['Can you start the work the same day?','Sometimes approved work may be able to begin during the same visit when the schedule, materials and scope allow, but we do not promise same-day completion.'],
 ['Do you only do drywall?','No. Drywall is one common need, but The Unfinished List is built for a range of handyman repairs, adjustments, installations and finish work around the home.'],
 ['What if plumbing is part of the project?','That is one of the advantages of Good Life. We are a professional handyman service with licensed plumbing capability under the same company.'],
 ['What areas do you serve?','This campaign is focused on Fort Collins, Windsor and Loveland, with service across our Northern Colorado area.']
];

function CTA({children='Book Your In-Home Quote'}){
 return <a className="btn primary" href="#qualification">{children}<ArrowRight size={18}/></a>
}

function Title({eyebrow,title,text}){
 return <div className="section-title">
  {eyebrow&&<div className="eyebrow">{eyebrow}</div>}
  <h2>{title}</h2>
  {text&&<p>{text}</p>}
 </div>
}

export default function App(){
 const [open,setOpen]=useState(0);

 const [form,setForm]=useState({
  name:'',
  phone:'',
  cityOrZip:'',
  projectList:''
 });

 return <div>
  <header className="nav">
   <div className="shell nav-inner">
    <a className="brand" href="/" aria-label="Good Life Home Co.">
     <img src="/brand/good-life-lockup-color.svg" alt="Good Life Home Co."/>
    </a>
    <a className="btn small" href="#qualification">Book Your In-Home Quote</a>
   </div>
  </header>

  <main>

   <section className="hero">
    <div className="shell hero-grid">
     <div>
      <div className="eyebrow">GOOD LIFE HANDYMAN SERVICE</div>
      <h1>Bring Us the Unfinished List.</h1>
      <p className="lead">
       The drywall patch. The door that needs adjusted. The loose trim. The half-finished project you were going to get back to three months ago. We’ll come out, walk the list with you, scope the work clearly and help you start knocking it out.
      </p>
      <CTA/>
      <p className="micro">Professional handyman service from a local home-service team.</p>
      <div className="location"><MapPin size={16}/>Fort Collins • Windsor • Loveland</div>
     </div>

     <div className="hero-card">
      <div className="hero-card-top">
       <ClipboardList/>
       <div>
        <small>THE UNFINISHED LIST</small>
        <b>Walk it → Scope it → Get it done</b>
       </div>
      </div>

      <div className="results">
       <div><span>Drywall patch</span><b>Still visible</b><em>On the list</em></div>
       <div><span>Door adjustment</span><b>Still sticking</b><em>On the list</em></div>
       <div><span>Loose trim</span><b>Still loose</b><em>On the list</em></div>
       <div><span>DIY project</span><b>Half finished</b><em>On the list</em></div>
      </div>

      <small className="example">Sound familiar? Bring us your list.</small>
     </div>
    </div>
   </section>

   <section className="trust">
    <div className="shell trust-grid">
     {facts.map(([I,t,x])=>
      <div className="trust-item" key={t}>
       <I size={22}/>
       <div>
        <b>{t}</b>
        <span>{x}</span>
       </div>
      </div>
     )}
    </div>
   </section>

   <section className="section">
    <div className="shell">
     <Title
      eyebrow="WHY THE LIST KEEPS GROWING"
      title="Too small for a remodel. Too annoying to ignore."
      text="Most homes have a handful of repairs and projects that never become the top priority. Individually they may be small. Together, they become the list you notice every day."
     />

     <div className="grid4">
      {services.map(([I,a,b])=>
       <article key={a}>
        <I size={24}/>
        <h3>{a}</h3>
        <p>{b}</p>
       </article>
      )}
     </div>

     <div className="center">
      <CTA>Let’s Get It Off the List</CTA>
     </div>
    </div>
   </section>

   <section className="section soft">
    <div className="shell">
     <Title
      eyebrow="HOW IT WORKS"
      title="A straightforward way to finally move the list forward."
     />

     <div className="steps">
      <article>
       <span>1</span>
       <ClipboardList/>
       <h3>Walk the list</h3>
       <p>Show us the repairs, unfinished projects and little things around the house that have been bothering you.</p>
      </article>

      <article>
       <span>2</span>
       <Wrench/>
       <h3>Scope the work</h3>
       <p>We gather measurements, photos, materials and the relevant conditions so the work is clearly defined.</p>
      </article>

      <article>
       <span>3</span>
       <Check/>
       <h3>Review your quote</h3>
       <p>Good Life builds and presents a clear scope and price. You decide what you want to move forward with.</p>
      </article>
     </div>
    </div>
   </section>

   <section className="section dark">
    <div className="shell twocol">
     <div>
      <div className="eyebrow light">THE GOOD LIFE DIFFERENCE</div>
      <h2>Handyman service with a real home-service company behind it.</h2>
      <p>
       Sometimes a “small” home project crosses into plumbing, needs a better repair plan, or simply deserves more professionalism than a random side-job contractor can offer. Good Life brings handyman and licensed plumbing capability together under one team.
      </p>

      <div className="checks">
       {[
        'Professional home-service team',
        'Clear communication',
        'Defined scope before approval',
        'Licensed plumbing capability when needed'
       ].map(x=>
        <div key={x}><Check size={17}/>{x}</div>
       )}
      </div>
     </div>

     <aside>
      <small>THE IDEA</small>
      <blockquote>“Every homeowner has this list.”</blockquote>
      <p>Bring us the unfinished list. We’ll help you figure out what it takes to get it finished.</p>
     </aside>
    </div>
   </section>

   <section className="section reviews-section">
    <div className="shell">
     <Title
      eyebrow="WHAT HOMEOWNERS SAY"
      title="Trusted for the repairs that don’t fit neatly in one box."
      text="Good Life homeowners consistently mention clear communication, practical problem-solving and quality work."
     />

     <div className="review-grid">
      <article>
       <div className="review-stars">★★★★★</div>
       <p>“Results were excellent.”</p>
       <b>Eric L.</b>
       <span>Google review · water-damage repair</span>
      </article>

      <article>
       <div className="review-stars">★★★★★</div>
       <p>Trusted Good Life for a variety of home repairs and appreciated the practical solutions, fair pricing and timely work.</p>
       <b>Bob M.</b>
       <span>Google review · multiple home repairs</span>
      </article>

      <article>
       <div className="review-stars">★★★★★</div>
       <p>Praised the honest recommendations, professional service and the team’s ability to solve an unexpected dishwasher issue along the way.</p>
       <b>Whitney B.</b>
       <span>Google review · home maintenance</span>
      </article>
     </div>
    </div>
   </section>

   <section className="section project-showcase">
    <div className="shell">
     <Title
      eyebrow="REAL GOOD LIFE PROJECT"
      title="One problem. One team. Completely put back together."
      text="A toilet-room leak became more than a plumbing repair. We handled the damaged materials and the finish work so the homeowner didn’t have to coordinate multiple contractors."
     />

     <div className="project-grid">
      <div className="project-story">
       <div className="eyebrow">UPSTAIRS + MAIN LEVEL REPAIR</div>
       <h3>From the drain to the final coat of paint.</h3>
       <p>
        The repair included drain work, damaged subfloor replacement, new flooring, trim and paint in the toilet room—plus drywall, texture, paint and cabinetry repairs in the kitchen below.
       </p>

       <div className="project-scope">
        {[
         'Drain repair',
         'Subfloor replacement',
         'New flooring',
         'Trim & paint',
         'Drywall & texture',
         'Cabinet repair'
        ].map(x=>
         <span key={x}><Check size={15}/>{x}</span>
        )}
       </div>

       <CTA>Show Us Your Project</CTA>
      </div>

      <div className="project-photos">
       <figure className="tall">
        <img src="/projects/toilet-during.jpg" alt="Toilet room during drain and subfloor repair"/>
        <figcaption>During · drain + subfloor repair</figcaption>
       </figure>

       <figure className="tall">
        <img src="/projects/toilet-after.jpg" alt="Finished toilet room after flooring trim and paint"/>
        <figcaption>After · flooring + trim + paint</figcaption>
       </figure>

       <figure>
        <img src="/projects/kitchen-during.jpg" alt="Kitchen during cabinet and drywall repair"/>
        <figcaption>During · cabinet + drywall repair</figcaption>
       </figure>

       <figure>
        <img src="/projects/kitchen-after.jpg" alt="Finished kitchen after cabinet drywall texture and paint repair"/>
        <figcaption>After · repaired + finished</figcaption>
       </figure>
      </div>
     </div>

     <p className="project-note">
      Real Good Life project photos. Repair scope shown is specific to this home; every project is evaluated individually.
     </p>
    </div>
   </section>

   <section className="section qualification" id="qualification">
    <div className="shell">
     <Title
      eyebrow="START HERE"
      title="Book your in-home quote."
      text="Tell us what’s on your unfinished list. We’ll contact you to confirm the visit and walk the projects with you in your home."
     />

     <form
      className="form-card"
      onSubmit={async e=>{
       e.preventDefault();

       const payload={
        ...form,
        campaign:'unfinished-list-handyman',
        offer:'Book Your In-Home Quote'
       };

       try{
        const r=await fetch('/api/hcp-lead',{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(payload)
        });

        if(!r.ok) throw new Error('submit failed');

        if (typeof window.fbq === 'function') {
          window.fbq('track', 'Lead');
        }

        window.location.href='/thank-you.html';
       }catch(err){
        alert("We couldn't send your request yet. Please call Good Life at 970-610-6200.");
       }
      }}
     >

      <div className="form-grid">
       <label>
        Name
        <input
         required
         value={form.name}
         onChange={e=>setForm({...form,name:e.target.value})}
        />
       </label>

       <label>
        Phone
        <input
         required
         type="tel"
         value={form.phone}
         onChange={e=>setForm({...form,phone:e.target.value})}
        />
       </label>

       <label>
        City or ZIP
        <input
         required
         value={form.cityOrZip}
         onChange={e=>setForm({...form,cityOrZip:e.target.value})}
        />
       </label>
      </div>

      <label>
       What’s on your list?
       <input
        required
        value={form.projectList}
        onChange={e=>setForm({...form,projectList:e.target.value})}
        placeholder="Drywall repair, door adjustment, trim, half-finished project... tell us what you want us to look at."
       />
      </label>

      <button className="btn btn-primary submit" type="submit">
       Book Your In-Home Quote <ArrowRight size={18}/>
      </button>

      <p className="privacy">
       Your request is not a confirmed appointment yet. Good Life will contact you to confirm a day and time.
      </p>
     </form>
    </div>
   </section>

   <section className="section faq">
    <div className="shell">
     <Title eyebrow="FAQ" title="A few things to know before we come out."/>

     <div className="faq-list">
      {faqs.map(([q,a],i)=>
       <button
        type="button"
        className={open===i?'open':''}
        key={q}
        onClick={()=>setOpen(open===i?-1:i)}
       >
        <div>
         <b>{q}</b>
         <ChevronDown size={18}/>
        </div>
        {open===i&&<p>{a}</p>}
       </button>
      )}
     </div>
    </div>
   </section>

   <section className="final">
    <div className="shell">
     <ClipboardList size={34}/>
     <h2>That list isn’t going to finish itself.</h2>
     <p>Bring us the unfinished list.</p>
     <CTA/>
     <div className="location white"><MapPin size={16}/>Fort Collins • Windsor • Loveland</div>
    </div>
   </section>

  </main>

  <footer>
   <div className="shell footer">
    <a className="brand" href="/" aria-label="Good Life Home Co.">
     <img src="/brand/good-life-lockup-white.svg" alt="Good Life Home Co."/>
    </a>
    <span><Phone size={15}/>970-610-6200</span>
   </div>
  </footer>

  <a className="mobile-sticky" href="#qualification">
   Book Your In-Home Quote
  </a>
 </div>
}