import { useState, useRef, useEffect, useCallback } from "react";

// ── Accounting policy & prompts (copied from your Supabase function) ──────────
const ACCOUNTING_POLICY = `
Revenue Recognition Policy - Ejada Systems Company

The Group generates revenue from the sale of services, services time & material, maintenance and products. The Group also generates revenue from providing professional services to end-users to maintain the customer's IT infrastructure such as operations & maintenance and managed services.

The Group recognizes revenue when it satisfies a performance obligation by transferring control of a product or service to a customer based on allocated transaction price of each performance obligation.

Key indicators for control transfer at a point in time:
a) the Group has a right to payment for the product or service;
(ii) the customer has legal title to the product;
(iii) the Group has transferred physical possession of the product to the customer;
(iv) the customer has the significant risks and rewards of ownership of the product;
(v) the customer has accepted the product.

Transaction price is allocated to each performance obligation with reference to the price specified in the underlying customer contract using standalone selling prices.

Products revenue - Hardware revenue:
Revenue is primarily recognized on a gross basis as the principal when the product is received by the client. The Group controls the product prior to transfer, assumes primary responsibility, assumes inventory risk, sets the price, and works closely with clients.

Principal vs Agent:
Indicators: (i) primarily responsible for fulfilling the promise, (ii) has inventory risk, (iii) has discretion in establishing the price.
Principal = gross basis. Agent = net basis.

Sale of software licenses, acting as an agent:
Performance obligation is to arrange for licenses to be provided by the software company, satisfied at point in time. Revenue = agent fees + sales proceeds - costs from software company.

Sale of software, acting as a principal:
Group acts as principal on licenses it owns/controls. Revenue recognized at point in time.

Maintenance revenue:
Recognized over time when customer simultaneously receives and consumes benefits.

Maintenance revenue, acting as a principal:
Software maintenance conveys rights to updates, bug fixes, help desk support. Licenses are distinct when sold with maintenance. Revenue recognized over time.

Maintenance revenue, acting as an agent:
Performance obligation is to arrange for maintenance by vendor, satisfied at point in time. Revenue = agent fees + sales proceeds - costs.

Services (fixed price) revenue:
Group is primary obligor, makes decisions on resource utilization. Revenue recognized over time.

Services (outsourcing) revenue:
Provision of manpower for maintaining IT infrastructure. Revenue recognized over time throughout the contract term.
`;

const SYSTEM_PROMPT = `You are an IFRS 15 expert auditor. You analyze contracts, purchase orders, and scope of work documents to complete an IFRS 15 Revenue Recognition assessment checklist.

IMPORTANT: The contract may be in Arabic, English, or a mix of both languages. You MUST be able to read and understand Arabic contracts fully. If the contract is in Arabic, translate and interpret all terms correctly before performing the assessment. All output MUST be in English regardless of the input language.

You MUST identify performance obligations ONLY based on the following accounting policy:
${ACCOUNTING_POLICY}

When analyzing a contract document, extract and assess the following sections:

1. CONTRACT SUMMARY: Customer name, customer code, business segment, geography, contract date, contract value, currency, contract duration, payment terms, scope description.

2. CONTRACT IDENTIFICATION (Step 1): Whether the contract meets IFRS 15 criteria - parties approved, rights identified, payment terms identified, commercial substance, collectability probable.

3. PO IDENTIFICATION / PERFORMANCE OBLIGATIONS (Step 2): Identify each distinct performance obligation. Categories MUST be one of: Product, Maintenance, Services-Fixed Price, Services-Time & Material, Managed Services, Operational Support. Assess if each is distinct and if they form a series.

4. PRINCIPAL VS AGENT (Step 2B): For each PO, assess if the entity is principal or agent based on: control before transfer, responsibility for fulfillment, inventory risk, pricing discretion.

5. TRANSACTION PRICE (Step 3): Total transaction price, variable consideration, bonuses/penalties, significant financing.

6. ALLOCATING TRANSACTION PRICE (Step 4): Whether standalone selling prices are observable, allocation methodology (adjusted market, cost plus margin, residual).

7. REVENUE RECOGNITION (Step 5): For each PO - point in time vs over time, pattern of recognition, method of measurement.

Respond ONLY with valid JSON (no markdown fences, no preamble) matching this exact structure:
{"contractSummary":{"customerName":"string","customerCode":"string or N/A","businessSegment":"string","geography":"string","contractDate":"string","contractValue":"string","currency":"string","contractDuration":"string","paymentTerms":"string","scopeDescription":"string"},"contractIdentification":{"partiesApproved":{"answer":"Yes/No","comment":"string"},"rightsIdentified":{"answer":"Yes/No","comment":"string"},"paymentTermsIdentified":{"answer":"Yes/No","comment":"string"},"commercialSubstance":{"answer":"Yes/No","comment":"string"},"collectabilityProbable":{"answer":"Yes/No","comment":"string"},"conclusion":"string"},"performanceObligations":[{"id":1,"description":"string","category":"Product/Maintenance/Services-Fixed Price/Services-Time & Material/Managed Services/Operational Support","isDistinct":{"answer":"Yes/No","comment":"string"},"isSeries":{"answer":"Yes/No/N.A.","comment":"string"},"principalOrAgent":{"conclusion":"Principal/Agent","controlBeforeTransfer":{"answer":"Yes/No/N.A.","comment":"string"},"responsibleForFulfillment":{"answer":"Yes/No/N.A.","comment":"string"},"inventoryRisk":{"answer":"Yes/No/N.A.","comment":"string"},"pricingDiscretion":{"answer":"Yes/No","comment":"string"}},"revenueRecognition":{"pattern":"Over Time/Point in Time","method":"string","comment":"string"}}],"transactionPrice":{"totalPrice":"string","variableConsideration":{"answer":"Yes/No","comment":"string"},"bonusesPenalties":{"answer":"Yes/No","comment":"string"},"significantFinancing":{"answer":"Yes/No","comment":"string"},"conclusion":"string"},"priceAllocation":{"standaloneSellingPriceObservable":{"answer":"Yes/No","comment":"string"},"allocationMethodology":"string","allocatedPrices":[{"poId":1,"amount":"string","comment":"string"}],"conclusion":"string"},"overallConclusion":"string"}`;

// ── Anthropic API call ────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function parseJSON(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(m ? m[1].trim() : text.trim());
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Badge({ children, variant = "default", className = "" }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
  const variants = {
    default: "bg-[#1a3a5c] text-[#93c5fd]",
    outline: "border border-[#2d4a6a] text-[#93c5fd]",
    secondary: "bg-[#1e2d3d] text-[#94a3b8]",
    success: "bg-[#0f2a1e] text-[#4ade80]",
    warning: "bg-[#2a1f0a] text-[#fbbf24]",
  };
  return <span className={`${base} ${variants[variant] || variants.default} ${className}`}>{children}</span>;
}

function AnswerPill({ answer }) {
  if (!answer) return null;
  const yes = answer.toLowerCase() === "yes";
  const no = answer.toLowerCase() === "no";
  const na = answer.toLowerCase() === "n.a." || answer.toLowerCase() === "n/a";
  if (yes) return <span style={{background:"#0f2a1e",color:"#4ade80",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{answer}</span>;
  if (no) return <span style={{background:"#2a0f0f",color:"#f87171",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{answer}</span>;
  return <span style={{background:"#1e2d3d",color:"#94a3b8",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{answer}</span>;
}

function AssessmentRow({ label, answer, comment, subItem }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:2,padding:"8px 0",borderBottom:"0.5px solid #1e2d3d"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {subItem && <span style={{width:12,height:1,background:"#2d4a6a",flexShrink:0}}/>}
        <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{label}</span>
        <AnswerPill answer={answer}/>
      </div>
      {comment && <p style={{fontSize:11,color:"#64748b",marginLeft:subItem?20:0,marginTop:2}}>{comment}</p>}
    </div>
  );
}

function Section({ title, step, ifrsRef, children }) {
  return (
    <div style={{background:"#0d1f2d",border:"0.5px solid #1e3a52",borderRadius:10,overflow:"hidden",marginBottom:12}}>
      <div style={{background:"#0a1929",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"0.5px solid #1e3a52"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{background:"#1a3a5c",color:"#60a5fa",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,fontFamily:"monospace"}}>{step}</span>
          <span style={{fontWeight:600,color:"#e2e8f0",fontSize:14}}>{title}</span>
        </div>
        {ifrsRef && <span style={{fontSize:10,color:"#475569",fontFamily:"monospace"}}>{ifrsRef}</span>}
      </div>
      <div style={{padding:"12px 16px"}}>{children}</div>
    </div>
  );
}

// ── Upload area ───────────────────────────────────────────────────────────────
function UploadZone({ label, sublabel, file, onFile, accept = ".pdf,.txt,.docx,.doc" }) {
  const ref = useRef();
  const [dragging, setDragging] = useState(false);

  const handleFile = (f) => { if (f) onFile(f); };
  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };

  return (
    <div
      onDragOver={(e)=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={onDrop}
      onClick={()=>ref.current.click()}
      style={{
        border:`2px dashed ${dragging?"#3b82f6":file?"#22c55e":"#2d4a6a"}`,
        borderRadius:10,padding:"28px 20px",textAlign:"center",cursor:"pointer",
        background:dragging?"#0a1929":file?"#0a1f15":"#0a1929",
        transition:"all 0.2s"
      }}
    >
      <input ref={ref} type="file" accept={accept} style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      <div style={{fontSize:28,marginBottom:8}}>{file ? "✅" : "📄"}</div>
      <div style={{fontWeight:600,color:file?"#4ade80":"#93c5fd",fontSize:13,marginBottom:4}}>
        {file ? file.name : label}
      </div>
      <div style={{fontSize:11,color:"#475569"}}>{file ? "Click to replace" : sublabel}</div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("upload"); // upload | loading | results
  const [contractFile, setContractFile] = useState(null);
  const [sheetFile, setSheetFile] = useState(null);
  const [manualText, setManualText] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [contractText, setContractText] = useState("");
  const chatEndRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [chatMessages]);

  const readFileText = (f) => new Promise((res, rej) => {
    if (!f) return res("");
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsText(f);
  });

  const handleAnalyze = async () => {
    setError(null);
    let text = manualText.trim();
    if (contractFile && !text) {
      try { text = await readFileText(contractFile); } catch { setError("Could not read file. Please paste text manually."); return; }
    }
    if (!text) { setError("Please upload a contract file or paste the contract text."); return; }
    setContractText(text);
    setView("loading");
    setLoadingMsg("Running IFRS 15 assessment across all 5 steps…");
    try {
      const raw = await callClaude(SYSTEM_PROMPT, `Analyze the following contract and complete the IFRS 15 assessment. Respond ONLY with the JSON object, no markdown fences.\n\nCONTRACT:\n${text}`);
      const parsed = parseJSON(raw);
      setAssessment(parsed);
      setView("results");
    } catch (e) {
      setError("Analysis failed: " + e.message);
      setView("upload");
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: "user", content: text };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    try {
      const systemChat = `You are an IFRS 15 expert. Answer questions about this contract and its assessment. Be concise and reference specific sections when helpful.\n\nCONTRACT:\n${contractText||"Not provided"}\n\nASSESSMENT:\n${assessment ? JSON.stringify(assessment, null, 2) : "Not completed"}`;
      const reply = await callClaude(systemChat, updated.map(m=>`${m.role==="user"?"User":"Assistant"}: ${m.content}`).join("\n\nAssistant: "));
      setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error: " + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── UPLOAD VIEW ───────────────────────────────────────────────────────────
  const UploadView = () => (
    <div style={{maxWidth:680,margin:"0 auto",padding:"0 16px 48px"}}>
      {/* Hero */}
      <div style={{textAlign:"center",padding:"48px 0 32px"}}>
        <div style={{width:56,height:56,background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16,fontSize:24}}>📋</div>
        <h1 style={{fontSize:28,fontWeight:800,color:"#e2e8f0",margin:"0 0 8px",letterSpacing:"-0.5px"}}>IFRS 15 Assessment</h1>
        <p style={{color:"#64748b",fontSize:13,margin:0}}>AI-powered revenue recognition checklist · Ejada Systems policy applied</p>
      </div>

      {/* Steps bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:28}}>
        {["Contract ID","Performance Obligations","Transaction Price","Price Allocation","Revenue Recognition"].map((s,i)=>(
          <div key={s} style={{background:"#0d1f2d",border:"0.5px solid #1e3a52",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#3b82f6",fontFamily:"monospace",fontWeight:700,marginBottom:3}}>Step {i+1}</div>
            <div style={{fontSize:10,color:"#64748b",lineHeight:1.3}}>{s}</div>
          </div>
        ))}
      </div>

      {/* Upload zones */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <UploadZone label="Upload Contract" sublabel="PDF, DOCX, TXT" file={contractFile} onFile={setContractFile}/>
        <UploadZone label="Contract Sheet (Optional)" sublabel="For comparison analysis" file={sheetFile} onFile={setSheetFile}/>
      </div>

      {/* Manual text */}
      <div style={{position:"relative",marginBottom:4}}>
        <div style={{position:"absolute",top:-9,left:16,background:"#060f1a",padding:"0 6px",fontSize:10,color:"#475569",fontFamily:"monospace"}}>OR PASTE TEXT</div>
        <textarea
          value={manualText}
          onChange={e=>setManualText(e.target.value)}
          placeholder="Paste your contract, PO, or scope of work here…"
          style={{width:"100%",height:140,background:"#0a1929",border:"0.5px solid #1e3a52",borderRadius:8,padding:12,color:"#cbd5e1",fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
        />
      </div>

      {error && (
        <div style={{background:"#2a0f0f",border:"0.5px solid #7f1d1d",borderRadius:8,padding:"10px 14px",color:"#f87171",fontSize:12,marginBottom:12}}>⚠ {error}</div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={!contractFile && !manualText.trim()}
        style={{width:"100%",padding:"13px",background:(contractFile||manualText.trim())?"linear-gradient(135deg,#1d4ed8,#0ea5e9)":"#1e2d3d",border:"none",borderRadius:10,color:(contractFile||manualText.trim())?"#fff":"#475569",fontWeight:700,fontSize:14,cursor:(contractFile||manualText.trim())?"pointer":"not-allowed",transition:"all 0.2s"}}
      >
        Run IFRS 15 Assessment {sheetFile ? "with Comparison" : ""}
      </button>

      {/* Policy note */}
      <div style={{marginTop:16,background:"#0a1929",border:"0.5px solid #1e3a52",borderRadius:8,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
        <span style={{fontSize:16,flexShrink:0}}>🛡</span>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"#93c5fd",marginBottom:3}}>Accounting Policy Applied</div>
          <div style={{fontSize:11,color:"#475569",lineHeight:1.5}}>Performance obligations identified per Ejada Systems' revenue recognition policy covering hardware, software licenses, maintenance, fixed-price services, and outsourcing — with principal vs agent assessment per category.</div>
        </div>
      </div>
    </div>
  );

  // ── LOADING VIEW ──────────────────────────────────────────────────────────
  const LoadingView = () => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
      <div style={{width:56,height:56,border:"3px solid #1e3a52",borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 0.9s linear infinite"}}/>
      <div style={{color:"#93c5fd",fontSize:14,fontWeight:600}}>{loadingMsg}</div>
      <div style={{color:"#475569",fontSize:11}}>Analyzing against 5-step IFRS 15 framework…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── RESULTS VIEW ──────────────────────────────────────────────────────────
  const ResultsView = () => {
    if (!assessment) return null;
    const { contractSummary: cs, contractIdentification: ci, performanceObligations: pos, transactionPrice: tp, priceAllocation: pa } = assessment;

    return (
      <div style={{maxWidth:800,margin:"0 auto",padding:"0 16px 80px"}}>
        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 0 16px"}}>
          <button onClick={()=>{setView("upload");setAssessment(null);setContractFile(null);setSheetFile(null);setManualText("");setChatMessages([]);}} style={{background:"none",border:"0.5px solid #1e3a52",borderRadius:7,padding:"6px 12px",color:"#93c5fd",cursor:"pointer",fontSize:12}}>← New Assessment</button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>✓ Assessment Complete</span>
          </div>
        </div>

        {/* Contract Summary */}
        <Section title="Contract Summary" step="I">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["Customer Name",cs.customerName],["Customer Code",cs.customerCode],["Business Segment",cs.businessSegment],["Geography",cs.geography],["Contract Date",cs.contractDate],["Contract Value",`${cs.currency} ${cs.contractValue}`],["Duration",cs.contractDuration],["Payment Terms",cs.paymentTerms]].map(([l,v])=>(
              <div key={l} style={{background:"#060f1a",borderRadius:7,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{l}</div>
                <div style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>{v||"—"}</div>
              </div>
            ))}
            <div style={{gridColumn:"1/-1",background:"#060f1a",borderRadius:7,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Scope Description</div>
              <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.5}}>{cs.scopeDescription||"—"}</div>
            </div>
          </div>
        </Section>

        {/* Step 1 */}
        <Section title="Contract Identification" step="Step 1" ifrsRef="IFRS 15.9-16">
          <AssessmentRow label="Have the parties approved the contract?" answer={ci.partiesApproved.answer} comment={ci.partiesApproved.comment}/>
          <AssessmentRow label="Are the rights of each party identified?" answer={ci.rightsIdentified.answer} comment={ci.rightsIdentified.comment}/>
          <AssessmentRow label="Are payment terms identified?" answer={ci.paymentTermsIdentified.answer} comment={ci.paymentTermsIdentified.comment}/>
          <AssessmentRow label="Does the contract have commercial substance?" answer={ci.commercialSubstance.answer} comment={ci.commercialSubstance.comment}/>
          <AssessmentRow label="Is it probable that consideration will be collected?" answer={ci.collectabilityProbable.answer} comment={ci.collectabilityProbable.comment}/>
          <div style={{marginTop:10,background:"#060f1a",borderRadius:7,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Conclusion</div>
            <div style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>{ci.conclusion}</div>
          </div>
        </Section>

        {/* Step 2 */}
        <Section title="Identifying Performance Obligations" step="Step 2" ifrsRef="IFRS 15.22-30">
          <div style={{marginBottom:12,fontSize:12,color:"#64748b"}}>
            Performance Obligations Identified: <Badge variant="secondary">{pos.length}</Badge>
          </div>
          {pos.map((po, idx) => (
            <div key={po.id} style={{border:"0.5px solid #1e3a52",borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <Badge>PO {idx+1}</Badge>
                <span style={{fontSize:12,fontWeight:600,color:"#e2e8f0",flex:1}}>{po.description}</span>
                <Badge variant="outline">{po.category}</Badge>
              </div>
              <AssessmentRow label="Is this a distinct performance obligation?" answer={po.isDistinct.answer} comment={po.isDistinct.comment}/>
              <AssessmentRow label="Does it qualify as a series?" answer={po.isSeries.answer} comment={po.isSeries.comment}/>
              <div style={{marginTop:10,borderTop:"0.5px solid #1e3a52",paddingTop:10}}>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Principal vs Agent · IFRS 15.B34-B38</div>
                <AssessmentRow label="Entity controls goods/services before transfer?" answer={po.principalOrAgent.controlBeforeTransfer.answer} comment={po.principalOrAgent.controlBeforeTransfer.comment} subItem/>
                <AssessmentRow label="Primarily responsible for fulfillment?" answer={po.principalOrAgent.responsibleForFulfillment.answer} comment={po.principalOrAgent.responsibleForFulfillment.comment} subItem/>
                <AssessmentRow label="Bears inventory risk?" answer={po.principalOrAgent.inventoryRisk.answer} comment={po.principalOrAgent.inventoryRisk.comment} subItem/>
                <AssessmentRow label="Has pricing discretion?" answer={po.principalOrAgent.pricingDiscretion.answer} comment={po.principalOrAgent.pricingDiscretion.comment} subItem/>
                <div style={{marginTop:8,background:"#060f1a",borderRadius:6,padding:"7px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#475569"}}>Conclusion</span>
                  <Badge variant={po.principalOrAgent.conclusion.toLowerCase()==="principal"?"default":"secondary"}>{po.principalOrAgent.conclusion}</Badge>
                </div>
              </div>
              <div style={{marginTop:10,borderTop:"0.5px solid #1e3a52",paddingTop:10}}>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Revenue Recognition · IFRS 15.31-45</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8}}>
                  {[["Pattern",po.revenueRecognition.pattern],["Method",po.revenueRecognition.method],["Comment",po.revenueRecognition.comment]].map(([l,v])=>(
                    <div key={l} style={{background:"#060f1a",borderRadius:6,padding:"7px 10px"}}>
                      <div style={{fontSize:9,color:"#475569",marginBottom:3}}>{l}</div>
                      <div style={{fontSize:11,color:"#cbd5e1"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </Section>

        {/* Step 3 */}
        <Section title="Determining the Transaction Price" step="Step 3" ifrsRef="IFRS 15.47-72">
          <AssessmentRow label="Is there variable consideration?" answer={tp.variableConsideration.answer} comment={tp.variableConsideration.comment}/>
          <AssessmentRow label="Are there bonuses/penalties clauses?" answer={tp.bonusesPenalties.answer} comment={tp.bonusesPenalties.comment}/>
          <AssessmentRow label="Is there a significant financing component?" answer={tp.significantFinancing.answer} comment={tp.significantFinancing.comment}/>
          <div style={{marginTop:10,background:"#060f1a",borderRadius:7,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Transaction Price</div>
            <div style={{fontSize:18,fontWeight:800,color:"#e2e8f0"}}>{tp.conclusion}</div>
          </div>
        </Section>

        {/* Step 4 */}
        <Section title="Allocating the Transaction Price" step="Step 4" ifrsRef="IFRS 15.73-86">
          <AssessmentRow label="Is the standalone selling price observable?" answer={pa.standaloneSellingPriceObservable.answer} comment={pa.standaloneSellingPriceObservable.comment}/>
          <div style={{background:"#060f1a",borderRadius:7,padding:"8px 10px",margin:"10px 0"}}>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Allocation Methodology</div>
            <div style={{fontSize:12,color:"#e2e8f0"}}>{pa.allocationMethodology}</div>
          </div>
          {pa.allocatedPrices.length > 0 && (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"#060f1a"}}>
                  {["PO #","Allocated Amount","Comment"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:"#475569",fontWeight:600,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pa.allocatedPrices.map(ap=>(
                  <tr key={ap.poId} style={{borderTop:"0.5px solid #1e3a52"}}>
                    <td style={{padding:"6px 8px",color:"#93c5fd",fontWeight:600}}>{ap.poId}</td>
                    <td style={{padding:"6px 8px",color:"#e2e8f0"}}>{ap.amount}</td>
                    <td style={{padding:"6px 8px",color:"#64748b"}}>{ap.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{marginTop:10,background:"#060f1a",borderRadius:7,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Conclusion</div>
            <div style={{fontSize:12,color:"#e2e8f0"}}>{pa.conclusion}</div>
          </div>
        </Section>

        {/* Summary table */}
        <Section title="Assessment Summary" step="Summary">
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
              <thead>
                <tr style={{background:"#060f1a"}}>
                  {["PO","Description","Category","Principal/Agent","Recognition","Allocated"].map(h=>(
                    <th key={h} style={{padding:"6px 8px",textAlign:"left",color:"#475569",fontWeight:600,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.map((po,idx)=>{
                  const ap = pa.allocatedPrices.find(a=>a.poId===po.id);
                  return (
                    <tr key={po.id} style={{borderTop:"0.5px solid #1e3a52"}}>
                      <td style={{padding:"7px 8px",color:"#3b82f6",fontWeight:700}}>{idx+1}</td>
                      <td style={{padding:"7px 8px",color:"#cbd5e1",maxWidth:180}}>{po.description}</td>
                      <td style={{padding:"7px 8px"}}><Badge variant="outline">{po.category}</Badge></td>
                      <td style={{padding:"7px 8px"}}><Badge variant={po.principalOrAgent.conclusion.toLowerCase()==="principal"?"default":"secondary"}>{po.principalOrAgent.conclusion}</Badge></td>
                      <td style={{padding:"7px 8px"}}><Badge variant={po.revenueRecognition.pattern.toLowerCase().includes("over")?"success":"warning"}>{po.revenueRecognition.pattern}</Badge></td>
                      <td style={{padding:"7px 8px",color:"#e2e8f0",fontWeight:600,textAlign:"right"}}>{ap?.amount||"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Overall conclusion */}
        <div style={{background:"#0a1929",border:"0.5px solid #1d4ed8",borderRadius:10,padding:"16px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:16}}>✅</span>
            <span style={{fontWeight:700,color:"#e2e8f0",fontSize:14}}>Overall Assessment Conclusion</span>
          </div>
          <p style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,margin:0}}>{assessment.overallConclusion}</p>
        </div>
      </div>
    );
  };

  // ── CHAT BUBBLE ───────────────────────────────────────────────────────────
  const ChatBubble = () => (
    <>
      {!chatOpen && view === "results" && (
        <button onClick={()=>setChatOpen(true)} style={{position:"fixed",bottom:24,right:24,width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",border:"none",color:"#fff",fontSize:22,cursor:"pointer",boxShadow:"0 4px 20px rgba(59,130,246,0.4)",display:"flex",alignItems:"center",justifyContent:"center"}}>💬</button>
      )}
      {chatOpen && (
        <div style={{position:"fixed",bottom:24,right:24,width:360,height:500,background:"#0d1f2d",border:"0.5px solid #1e3a52",borderRadius:14,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.5)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"0.5px solid #1e3a52",background:"#0a1929"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span>💬</span>
              <span style={{fontWeight:600,fontSize:13,color:"#e2e8f0"}}>Contract Q&A</span>
            </div>
            <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>×</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:8}}>
            {chatMessages.length===0 && (
              <div style={{textAlign:"center",color:"#475569",fontSize:11,marginTop:40}}>
                <div style={{fontSize:28,marginBottom:8}}>💬</div>
                <div>Ask anything about the contract or its IFRS 15 assessment.</div>
                <div style={{marginTop:4,fontSize:10}}>Supports English & Arabic</div>
              </div>
            )}
            {chatMessages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",background:m.role==="user"?"#1d4ed8":"#1e2d3d",color:m.role==="user"?"#fff":"#cbd5e1",borderRadius:9,padding:"8px 12px",fontSize:12,lineHeight:1.5}}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div style={{alignSelf:"flex-start",background:"#1e2d3d",borderRadius:9,padding:"8px 12px"}}><div style={{width:16,height:16,border:"2px solid #1e3a52",borderTop:"2px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/></div>}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:"10px",borderTop:"0.5px solid #1e3a52",display:"flex",gap:6}}>
            <input
              value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}
              placeholder="Ask about the contract…"
              disabled={chatLoading}
              style={{flex:1,background:"#060f1a",border:"0.5px solid #1e3a52",borderRadius:7,padding:"7px 10px",color:"#cbd5e1",fontSize:12,outline:"none",fontFamily:"inherit"}}
            />
            <button onClick={sendChat} disabled={!chatInput.trim()||chatLoading} style={{background:chatInput.trim()?"#1d4ed8":"#1e2d3d",border:"none",borderRadius:7,padding:"7px 12px",color:chatInput.trim()?"#fff":"#475569",cursor:chatInput.trim()?"pointer":"not-allowed",fontSize:14}}>➤</button>
          </div>
        </div>
      )}
    </>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#060f1a",color:"#e2e8f0",fontFamily:"'DM Sans', system-ui, sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      {/* Header */}
      <header style={{borderBottom:"0.5px solid #1e3a52",background:"#0a1929",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:800,margin:"0 auto",padding:"10px 16px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📋</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>IFRS 15 Assessment</div>
            <div style={{fontSize:10,color:"#475569"}}>Revenue Recognition Checklist · AI-Powered</div>
          </div>
          {view==="results" && <button onClick={()=>{setView("upload");setAssessment(null);setContractFile(null);setSheetFile(null);setManualText("");}} style={{marginLeft:"auto",background:"none",border:"0.5px solid #1e3a52",borderRadius:6,padding:"4px 10px",color:"#93c5fd",cursor:"pointer",fontSize:11}}>New Assessment</button>}
        </div>
      </header>

      {view==="upload" && <UploadView/>}
      {view==="loading" && <LoadingView/>}
      {view==="results" && <ResultsView/>}
      <ChatBubble/>

      <style>{`*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#060f1a}::-webkit-scrollbar-thumb{background:#1e3a52;border-radius:2px}`}</style>
    </div>
  );
}
