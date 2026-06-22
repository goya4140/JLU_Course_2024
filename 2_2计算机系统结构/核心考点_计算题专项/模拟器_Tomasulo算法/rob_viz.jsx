import { useState } from "react";

const INSTS = [
  {name:"LD.D   F2,00(R0)", issue:1,  es:2,  ee:2,  mem:3,    wb:4,    commit:5  },
  {name:"DIV.D  F0, F4,F2", issue:2,  es:5,  ee:24, mem:null, wb:25,   commit:26 },
  {name:"LD.D   F4,08(R0)", issue:3,  es:4,  ee:4,  mem:5,    wb:6,    commit:27 },
  {name:"ADD.D  F0, F4,F2", issue:4,  es:7,  ee:10, mem:null, wb:11,   commit:28 },
  {name:"ST.D   F0,10(R0)", issue:5,  es:6,  ee:6,  mem:29,   wb:null, commit:29 },
];

const QI_REGS = ["F0","F2","F4"];
const ROB_LABELS = ["ROB1","ROB2","ROB3","ROB4","ROB5"];

// ROB entry keys: busy, op, vj, qj, vk, qk, a, state, target, value, committed, exec
// exec:true  = currently executing (green row bg)
// committed  = already committed (dimmed)
// hl*        = highlight this cell gold (exam snapshot answers)

const N = {busy:false};

const STEPS = [
  {
    cycle:0, label:"初始状态", isExam:false,
    events:[
      {i:"📋",t:"所有 ROB 条目空闲（Busy=NO）"},
      {i:"✅",t:"寄存器 Qi 全为 0，数据均就绪"},
      {i:"📌",t:"R0=C6, F0=06, F2=0A, F4=B1（十六进制）"},
      {i:"🗄️",t:"Mem[C6]=00, Mem[CE]=11, Mem[D6]=33"},
    ],
    rob:{ROB1:N,ROB2:N,ROB3:N,ROB4:N,ROB5:N},
    qi:{F0:"0",F2:"0",F4:"0"},
    regs:{F0:"06",F2:"0A",F4:"B1",D6:"33"},
  },
  {
    cycle:1, label:"周期 1", isExam:false,
    events:[
      {i:"✅",t:"LD.D F2,00(R0) 流出 → ROB1"},
      {i:"→", t:"R0=C6 就绪 → Vj=C6；偏移 A=00"},
      {i:"📝",t:"Qi[F2] ← ROB1"},
    ],
    rob:{
      ROB1:{busy:true,op:"LD",vj:"C6",a:"00",state:"流出",target:"F2"},
      ROB2:N,ROB3:N,ROB4:N,ROB5:N,
    },
    qi:{F0:"0",F2:"ROB1",F4:"0"},
    regs:{F0:"06",F2:"0A",F4:"B1",D6:"33"},
  },
  {
    cycle:2, label:"周期 2", isExam:false,
    events:[
      {i:"⚙️",t:"LD.D F2 执行：地址计算 A=C6+00=C6"},
      {i:"✅",t:"DIV.D F0,F4,F2 流出 → ROB2"},
      {i:"→", t:"F4=B1 就绪→Vj=B1；Qi[F2]=ROB1→Qk=ROB1（等待）"},
      {i:"📝",t:"Qi[F0] ← ROB2"},
    ],
    rob:{
      ROB1:{busy:true,op:"LD",vj:"C6",a:"C6",state:"执行",target:"F2",exec:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",qk:"ROB1",state:"流出",target:"F0"},
      ROB3:N,ROB4:N,ROB5:N,
    },
    qi:{F0:"ROB2",F2:"ROB1",F4:"0"},
    regs:{F0:"06",F2:"0A",F4:"B1",D6:"33"},
  },
  {
    cycle:3, label:"周期 3", isExam:false,
    events:[
      {i:"💾",t:"LD.D F2 访存：读 Mem[C6]=00（下周期写回）"},
      {i:"✅",t:"LD.D F4,08(R0) 流出 → ROB3"},
      {i:"→", t:"R0=C6 就绪→Vj=C6；偏移 A=08"},
      {i:"📝",t:"Qi[F4] ← ROB3"},
    ],
    rob:{
      ROB1:{busy:true,op:"LD",vj:"C6",a:"C6",state:"访存",target:"F2"},
      ROB2:{busy:true,op:"DIV",vj:"B1",qk:"ROB1",state:"流出",target:"F0"},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"08",state:"流出",target:"F4"},
      ROB4:N,ROB5:N,
    },
    qi:{F0:"ROB2",F2:"ROB1",F4:"ROB3"},
    regs:{F0:"06",F2:"0A",F4:"B1",D6:"33"},
  },
  {
    cycle:4, label:"周期 4", isExam:false,
    events:[
      {i:"📤",t:"LD.D F2 写结果：CDB广播 F2=00 → ROB1.Value=00，State=写结果"},
      {i:"→", t:"ROB2.Qk=ROB1 → Vk←00（DIV.D 两操作数均就绪！）"},
      {i:"⚙️",t:"LD.D F4 执行：地址计算 A=C6+08=CE"},
      {i:"✅",t:"ADD.D F0,F4,F2 流出 → ROB4"},
      {i:"→", t:"Qi[F4]=ROB3→Qj=ROB3；F2 从CDB捕获00→Vk=00"},
      {i:"⚠️",t:"Qi[F0] ← ROB4（覆盖ROB2，WAW消除：DIV.D结果不写寄存器）"},
    ],
    rob:{
      ROB1:{busy:true,op:"LD",vj:"C6",a:"C6",state:"写结果",target:"F2",value:"00"},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"流出",target:"F0"},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"执行",target:"F4",exec:true},
      ROB4:{busy:true,op:"ADD",qj:"ROB3",vk:"00",state:"流出",target:"F0"},
      ROB5:N,
    },
    qi:{F0:"ROB4",F2:"ROB1",F4:"ROB3"},
    regs:{F0:"06",F2:"0A",F4:"B1",D6:"33"},
  },
  {
    cycle:5, label:"周期 5", isExam:true,
    events:[
      {i:"🎯",t:"ROB1 提交：F2←00 写寄存器，Qi[F2]←0，ROB1 释放（Busy=NO）"},
      {i:"💾",t:"LD.D F4 访存：读 Mem[CE]=11（下周期写回）"},
      {i:"⚙️",t:"DIV.D 操作数均就绪→开始执行（B1÷00，共20周期）"},
      {i:"✅",t:"ST.D F0,10(R0) 流出 → ROB5"},
      {i:"→", t:"R0=C6就绪→Vj=C6；Qi[F0]=ROB4→Qk=ROB4；偏移A=10"},
      {i:"⭐",t:"题目快照！Q1=00 Q2=CE Q3=F4 Q4=ROB3 Q5=C6"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"执行",target:"F0",exec:true, hlVk:true},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"访存",target:"F4", hlA:true,hlTarget:true},
      ROB4:{busy:true,op:"ADD",qj:"ROB3",vk:"00",state:"流出",target:"F0", hlQj:true},
      ROB5:{busy:true,op:"ST",vj:"C6",qk:"ROB4",a:"10",state:"流出", hlVj:true},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
    answers:{Q1:{v:"00",note:"ROB2.Vk"},Q2:{v:"CE",note:"ROB3.A"},Q3:{v:"F4",note:"ROB3.Target"},Q4:{v:"ROB3",note:"ROB4.Qj"},Q5:{v:"C6",note:"ROB5.Vj"}},
  },
  {
    cycle:6, label:"周期 6", isExam:false,
    events:[
      {i:"📤",t:"LD.D F4 写结果：CDB广播 F4=11 → ROB3.Value=11"},
      {i:"→", t:"ROB4.Qj=ROB3 → Vj←11（ADD.D 两操作数均就绪！）"},
      {i:"⚙️",t:"ST.D 地址计算：A=C6+10=D6（L/S单元空闲）"},
      {i:"⚙️",t:"DIV.D 执行中（2/20）"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"执行",target:"F0",exec:true},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"写结果",target:"F4",value:"11"},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"流出",target:"F0"},
      ROB5:{busy:true,op:"ST",vj:"C6",qk:"ROB4",a:"D6",state:"执行"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
  },
  {
    cycle:7, label:"周期 7", isExam:false,
    events:[
      {i:"⚙️",t:"ADD.D F0 操作数就绪+加法器空闲 → 开始执行（11+00）"},
      {i:"⚙️",t:"DIV.D 执行中（3/20）"},
      {i:"⏳",t:"ROB3(F4=11)就绪，等ROB2提交才能提交；ST.D等ADD.D结果"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"执行",target:"F0",exec:true},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"写结果",target:"F4",value:"11"},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"执行",target:"F0",exec:true},
      ROB5:{busy:true,op:"ST",vj:"C6",qk:"ROB4",a:"D6",state:"执行"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
  },
  {
    cycle:11, label:"周期 11", isExam:false,
    events:[
      {i:"📤",t:"ADD.D F0 写结果（11+00=11）→ ROB4.Value=11，State=写结果"},
      {i:"→", t:"ROB5.Qk=ROB4 → Vk←11（ST.D 获得待存数据，全部就绪）"},
      {i:"⏳",t:"ROB3/4/5 全部就绪，卡在 ROB2（DIV.D 7/20）之后无法提交"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"执行",target:"F0",exec:true},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"写结果",target:"F4",value:"11"},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"写结果",target:"F0",value:"11"},
      ROB5:{busy:true,op:"ST",vj:"C6",vk:"11",a:"D6",state:"写结果"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
  },
  {
    cycle:25, label:"周期 25", isExam:false,
    events:[
      {i:"📤",t:"DIV.D F0 写结果（B1÷00=∞）→ ROB2.Value=∞，State=写结果"},
      {i:"⚠️",t:"Qi[F0]=ROB4 ≠ ROB2 → 提交时 F0 寄存器不更新（WAW保护！）"},
      {i:"⏳",t:"ROB2 成为 HEAD，就绪，下周期提交"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:true,op:"DIV",vj:"B1",vk:"00",state:"写结果",target:"F0",value:"∞"},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"写结果",target:"F4",value:"11"},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"写结果",target:"F0",value:"11"},
      ROB5:{busy:true,op:"ST",vj:"C6",vk:"11",a:"D6",state:"写结果"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
  },
  {
    cycle:26, label:"周期 26", isExam:false,
    events:[
      {i:"🎯",t:"ROB2 提交（DIV.D）：检查 Qi[F0]=ROB4 ≠ ROB2"},
      {i:"⚠️",t:"F0 寄存器不更新！（WAW正确：F0 最终由 ADD.D 写入）"},
      {i:"🔓",t:"ROB2 释放（Busy=NO），HEAD 前进 → ROB3"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:false,op:"DIV",committed:true},
      ROB3:{busy:true,op:"LD",vj:"C6",a:"CE",state:"写结果",target:"F4",value:"11"},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"写结果",target:"F0",value:"11"},
      ROB5:{busy:true,op:"ST",vj:"C6",vk:"11",a:"D6",state:"写结果"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"ROB3"},
    regs:{F0:"06",F2:"00",F4:"B1",D6:"33"},
  },
  {
    cycle:27, label:"周期 27", isExam:false,
    events:[
      {i:"🎯",t:"ROB3 提交（LD.D F4）：Qi[F4]=ROB3 → 清零，F4←11 写入寄存器"},
      {i:"🔓",t:"ROB3 释放，HEAD → ROB4"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:false,op:"DIV",committed:true},
      ROB3:{busy:false,op:"LD",committed:true},
      ROB4:{busy:true,op:"ADD",vj:"11",vk:"00",state:"写结果",target:"F0",value:"11"},
      ROB5:{busy:true,op:"ST",vj:"C6",vk:"11",a:"D6",state:"写结果"},
    },
    qi:{F0:"ROB4",F2:"0",F4:"0"},
    regs:{F0:"06",F2:"00",F4:"11",D6:"33"},
  },
  {
    cycle:28, label:"周期 28", isExam:false,
    events:[
      {i:"🎯",t:"ROB4 提交（ADD.D F0）：Qi[F0]=ROB4 → 清零，F0←11 写入寄存器"},
      {i:"✅",t:"WAW正确：F0=11（来自ADD.D），不是DIV.D的∞"},
      {i:"🔓",t:"ROB4 释放，HEAD → ROB5"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:false,op:"DIV",committed:true},
      ROB3:{busy:false,op:"LD",committed:true},
      ROB4:{busy:false,op:"ADD",committed:true},
      ROB5:{busy:true,op:"ST",vj:"C6",vk:"11",a:"D6",state:"写结果"},
    },
    qi:{F0:"0",F2:"0",F4:"0"},
    regs:{F0:"11",F2:"00",F4:"11",D6:"33"},
  },
  {
    cycle:29, label:"周期 29 🎉", isExam:false,
    events:[
      {i:"🎯",t:"ROB5 提交（ST.D）：执行实际内存写入 Mem[D6] ← 11"},
      {i:"🔒",t:"Store 内存写入必须在提交时才发生（前瞻执行安全性保证）"},
      {i:"🎉",t:"全部5条指令提交完毕！F0=11, F2=00, F4=11, Mem[D6]=11"},
    ],
    rob:{
      ROB1:{busy:false,op:"LD",committed:true},
      ROB2:{busy:false,op:"DIV",committed:true},
      ROB3:{busy:false,op:"LD",committed:true},
      ROB4:{busy:false,op:"ADD",committed:true},
      ROB5:{busy:false,op:"ST",committed:true},
    },
    qi:{F0:"0",F2:"0",F4:"0"},
    regs:{F0:"11",F2:"00",F4:"11",D6:"11"},
  },
];

function getInstStatus(inst, cycle) {
  if (inst.issue > cycle) return null;
  let exec = null;
  if (inst.es <= cycle) {
    exec = inst.ee <= cycle
      ? (inst.es === inst.ee ? String(inst.es) : `${inst.es}–${inst.ee}`)
      : `${inst.es}–…`;
  }
  const mem    = inst.mem != null && inst.mem <= cycle ? String(inst.mem) : null;
  const wb     = inst.wb  != null && inst.wb  <= cycle ? String(inst.wb)  : null;
  const commit = inst.commit <= cycle ? String(inst.commit) : null;
  const done   = inst.commit <= cycle;
  return { issue: String(inst.issue), exec, mem, wb, commit, done };
}

export default function App() {
  const [step, setStep] = useState(0);
  const snap = STEPS[step];
  const c = snap.cycle;

  const P = {
    bg:"#0b0e18", s1:"#111827", s2:"#1a2236",
    border:"#263048", text:"#e2e8f0", muted:"#3d5070",
    cyan:"#38bdf8", green:"#4ade80", yellow:"#fbbf24",
    red:"#f87171", purple:"#c084fc", orange:"#fb923c",
    teal:"#2dd4bf", gold:"#ffd700",
  };

  return (
    <div style={{
      fontFamily:"'JetBrains Mono','Fira Code',Consolas,monospace",
      background:P.bg, color:P.text, padding:"14px",
      minHeight:"100vh", maxWidth:"920px", margin:"0 auto", fontSize:"11px",
    }}>

      {/* ── Title ── */}
      <div style={{textAlign:"center",marginBottom:"10px"}}>
        <div style={{fontSize:"17px",fontWeight:"700",color:P.cyan,letterSpacing:"0.04em"}}>
          前瞻执行（ROB）· 完整状态演示
        </div>
        <div style={{color:P.muted,fontSize:"9px",marginTop:"2px"}}>
          单流出 ｜ Load/Store×1 ｜ 浮点乘除×1 ｜ 浮点加法×1 ｜ RS+缓冲器合并入ROB ｜ 共5条指令
        </div>
      </div>

      {/* ── Exam answers panel ── */}
      {snap.isExam && snap.answers && (
        <div style={{background:"#0c2010",border:`2px solid ${P.green}`,borderRadius:"8px",
          padding:"10px 14px",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",color:P.green,fontWeight:"700",marginBottom:"6px"}}>
            ⭐ 周期 5 填空答案
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"6px"}}>
            {Object.entries(snap.answers).map(([q,{v,note}])=>(
              <div key={q} style={{background:"#0a2a18",border:"1px solid #1a5a30",
                borderRadius:"6px",padding:"6px 8px",textAlign:"center"}}>
                <div style={{fontSize:"12px",fontWeight:"700",color:P.green}}>{q}</div>
                <div style={{fontSize:"16px",fontWeight:"800",color:P.yellow,margin:"2px 0"}}>{v}</div>
                <div style={{fontSize:"8px",color:"#4a7a58"}}>{note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
        <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
          style={{padding:"5px 14px",border:`1px solid ${P.border}`,borderRadius:"6px",
            background:step>0?P.s2:P.s1,color:step>0?P.text:P.muted,
            cursor:step>0?"pointer":"default",fontFamily:"inherit",fontSize:"10px"}}>
          ← 上一步
        </button>
        <div style={{fontSize:"18px",fontWeight:"700",color:snap.isExam?P.green:P.yellow}}>
          {snap.label}
        </div>
        <button onClick={()=>setStep(s=>Math.min(STEPS.length-1,s+1))} disabled={step===STEPS.length-1}
          style={{padding:"5px 14px",border:`1px solid ${P.border}`,borderRadius:"6px",
            background:step<STEPS.length-1?P.s2:P.s1,color:step<STEPS.length-1?P.text:P.muted,
            cursor:step<STEPS.length-1?"pointer":"default",fontFamily:"inherit",fontSize:"10px"}}>
          下一步 →
        </button>
      </div>

      {/* ── Progress dots ── */}
      <div style={{display:"flex",justifyContent:"center",gap:"3px",marginBottom:"8px",flexWrap:"wrap"}}>
        {STEPS.map((s,i)=>(
          <button key={i} onClick={()=>setStep(i)}
            style={{width:"28px",height:"18px",border:`1px solid ${s.isExam?"#2a6a30":P.border}`,
              borderRadius:"3px",background:i===step?(s.isExam?"#1a5a28":P.cyan):P.s2,
              color:i===step?"#000":P.muted,fontSize:"8px",cursor:"pointer",
              fontFamily:"inherit",fontWeight:i===step?"700":"400"}}>
            {s.cycle}
          </button>
        ))}
      </div>

      {/* ── Progress bar ── */}
      <div style={{height:"2px",background:P.s2,borderRadius:"2px",marginBottom:"8px"}}>
        <div style={{height:"100%",background:snap.isExam?P.green:P.cyan,borderRadius:"2px",
          width:`${(step/(STEPS.length-1))*100}%`,transition:"width 0.25s"}}/>
      </div>

      {/* ── Events ── */}
      <div style={{background:P.s1,borderRadius:"8px",padding:"9px 13px",marginBottom:"9px",
        borderLeft:`3px solid ${snap.isExam?P.green:P.cyan}`}}>
        <div style={{fontSize:"8px",color:P.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"5px"}}>
          本周期事件
        </div>
        {snap.events.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:"6px",marginTop:"2px",alignItems:"flex-start"}}>
            <span style={{minWidth:"16px"}}>{e.i}</span>
            <span style={{fontSize:"10px",lineHeight:"1.5",
              color:e.i==="⭐"?P.green:P.text,fontWeight:e.i==="⭐"?"700":"400"}}>
              {e.t}
            </span>
          </div>
        ))}
      </div>

      {/* ── ① Instruction Status Table ── */}
      <div style={{background:P.s1,borderRadius:"8px",padding:"9px 12px",marginBottom:"9px"}}>
        <div style={{fontSize:"11px",color:P.cyan,fontWeight:"700",marginBottom:"7px"}}>
          ① 指令执行状态表
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["指令","流出","执行(周期)","访存","写结果","提交 ★"].map((h,hi)=>(
                <th key={h} style={{padding:"2px 5px",borderBottom:`1px solid ${P.border}`,
                  fontSize:"9px",color:hi===5?P.orange:P.muted,fontWeight:"600",
                  textAlign:hi===0?"left":"center"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INSTS.map((inst,i)=>{
              const st = getInstStatus(inst, c);
              if (!st) return (
                <tr key={i}>
                  <td style={{padding:"2px 5px",fontSize:"10px",color:P.muted}}>{inst.name}</td>
                  {[0,0,0,0,0].map((_,j)=>(
                    <td key={j} style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",color:P.muted}}>—</td>
                  ))}
                </tr>
              );
              const rowBg = !st.done ? "#0a1830" : "transparent";
              return (
                <tr key={i} style={{background:rowBg}}>
                  <td style={{padding:"2px 5px",fontSize:"10px",color:st.done?P.muted:P.text}}>{inst.name}</td>
                  <td style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",color:P.green}}>{st.issue}</td>
                  <td style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",color:st.exec?P.yellow:P.muted}}>
                    {st.exec||"—"}
                  </td>
                  <td style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",color:st.mem?P.purple:P.muted}}>
                    {inst.mem===null?"null":st.mem||"—"}
                  </td>
                  <td style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",color:st.wb?P.red:P.muted}}>
                    {inst.wb===null?"null":st.wb||"—"}
                  </td>
                  <td style={{padding:"2px 5px",textAlign:"center",fontSize:"10px",
                    color:st.commit?P.orange:P.muted,fontWeight:st.commit?"700":"400"}}>
                    {st.commit||"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Bottom grid: ② ROB | ③ Qi+Regs ── */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"9px"}}>

        {/* ② ROB State Table */}
        <div style={{background:P.s1,borderRadius:"8px",padding:"9px 12px"}}>
          <div style={{fontSize:"11px",color:P.cyan,fontWeight:"700",marginBottom:"7px"}}>
            ② ROB 状态表（保留站 + 缓冲器合并）
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["标签","Busy","Op","Vj/Qj","Vk/Qk","A(Imm)","State","Target","Value"].map(h=>(
                  <th key={h} style={{padding:"2px 3px",borderBottom:`1px solid ${P.border}`,
                    fontSize:"8px",color:P.muted,fontWeight:"600",textAlign:"center"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROB_LABELS.map(label=>{
                const r = snap.rob[label] || N;
                const committed = r.committed && !r.busy;
                const isExec = r.busy && r.exec;
                const rowBg = committed?"#081408":isExec?"#0d2a1a":r.busy?"#101c30":"transparent";
                const labelC = committed?"#2a5a2a":r.busy?P.yellow:P.muted;

                const vjqj = r.qj
                  ? {t:`Q:${r.qj}`,c:P.red,hl:r.hlQj}
                  : r.vj
                    ? {t:r.vj,c:P.cyan,hl:r.hlVj}
                    : {t:"—",c:P.muted};
                const vkqk = r.qk
                  ? {t:`Q:${r.qk}`,c:P.red,hl:r.hlQk}
                  : r.vk
                    ? {t:r.vk,c:P.cyan,hl:r.hlVk}
                    : {t:"—",c:P.muted};
                const stC = r.state==="写结果"?P.orange:r.state==="执行"?P.yellow:
                  r.state==="访存"?P.purple:r.state==="流出"?P.cyan:P.muted;

                const hl = (cond,content,color) => (
                  <td style={{padding:"2px 4px",textAlign:"center",fontSize:"10px",
                    color:cond?P.gold:color,fontWeight:cond?"700":"400",
                    background:cond?"#2a2000":"transparent"}}>
                    {cond?"★"+content:content}
                  </td>
                );

                return (
                  <tr key={label} style={{background:rowBg}}>
                    <td style={{padding:"2px 4px",fontSize:"10px",color:labelC,fontWeight:"700"}}>{label}</td>
                    <td style={{padding:"2px 4px",textAlign:"center",fontSize:"10px",
                      color:committed?"#2a5a2a":r.busy?P.green:P.muted}}>
                      {committed?"NO*":r.busy?"YES":"NO"}
                    </td>
                    <td style={{padding:"2px 4px",textAlign:"center",fontSize:"10px",color:P.purple}}>{r.op||""}</td>
                    {hl(!!vjqj.hl, vjqj.t, vjqj.c)}
                    {hl(!!vkqk.hl, vkqk.t, vkqk.c)}
                    {hl(!!r.hlA, r.a||"—", P.teal)}
                    <td style={{padding:"2px 4px",textAlign:"center",fontSize:"9px",
                      color:committed?"#2a5a2a":stC}}>
                      {committed?"已提交":r.state||""}
                    </td>
                    {hl(!!r.hlTarget, r.target||"—", P.green)}
                    <td style={{padding:"2px 4px",textAlign:"center",fontSize:"10px",color:P.orange}}>
                      {r.value||""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{marginTop:"5px",display:"flex",gap:"8px",flexWrap:"wrap",fontSize:"8px"}}>
            <span><span style={{color:P.cyan}}>●</span><span style={{color:P.muted}}> V字段(就绪)</span></span>
            <span><span style={{color:P.red}}>●</span><span style={{color:P.muted}}> Q字段(等待)</span></span>
            <span><span style={{color:"#0d2a1a",border:"1px solid #2a6a2a",padding:"0 4px"}}>绿底=执行中</span></span>
            <span><span style={{color:P.gold}}>★=题目答案</span></span>
          </div>
        </div>

        {/* ③ Qi + Register File */}
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>

          {/* Qi */}
          <div style={{background:P.s1,borderRadius:"8px",padding:"9px 12px"}}>
            <div style={{fontSize:"11px",color:P.cyan,fontWeight:"700",marginBottom:"6px"}}>
              ③ 寄存器状态表 Qi
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"5px"}}>
              {QI_REGS.map(reg=>{
                const val = snap.qi[reg];
                const ready = val==="0";
                return (
                  <div key={reg} style={{
                    background:ready?"#091409":"#1a0a30",
                    border:`1px solid ${ready?"#1a4a1a":"#3a1a60"}`,
                    borderRadius:"6px",padding:"5px 6px",textAlign:"center",
                  }}>
                    <div style={{fontSize:"8px",color:P.muted,marginBottom:"2px"}}>{reg}</div>
                    <div style={{fontSize:"12px",fontWeight:"700",color:ready?P.green:P.purple}}>
                      {ready?"0":val}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:"5px",fontSize:"8px",display:"flex",gap:"8px"}}>
              <span><span style={{color:P.green}}>●</span><span style={{color:P.muted}}> 0=就绪</span></span>
              <span><span style={{color:P.purple}}>●</span><span style={{color:P.muted}}> ROB#=等待</span></span>
            </div>
          </div>

          {/* Committed register file */}
          <div style={{background:P.s1,borderRadius:"8px",padding:"9px 12px",flex:1}}>
            <div style={{fontSize:"11px",color:P.cyan,fontWeight:"700",marginBottom:"4px"}}>
              ④ 架构寄存器文件
            </div>
            <div style={{fontSize:"8px",color:P.muted,marginBottom:"6px"}}>仅 Commit 时更新</div>
            {[["F0",snap.regs.F0],["F2",snap.regs.F2],["F4",snap.regs.F4]].map(([r,v])=>(
              <div key={r} style={{display:"flex",justifyContent:"space-between",
                padding:"3px 0",borderBottom:`1px solid ${P.border}`}}>
                <span style={{color:P.muted,fontSize:"10px"}}>{r}</span>
                <span style={{color:P.yellow,fontWeight:"600",fontSize:"10px"}}>{v}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",
              padding:"3px 0",borderBottom:`1px solid ${P.border}`}}>
              <span style={{color:P.muted,fontSize:"10px"}}>Mem[D6]</span>
              <span style={{color:snap.regs.D6==="11"?P.orange:P.teal,
                fontWeight:"600",fontSize:"10px"}}>{snap.regs.D6}</span>
            </div>

            {/* Commit order progress */}
            <div style={{marginTop:"10px"}}>
              <div style={{fontSize:"8px",color:P.muted,marginBottom:"4px"}}>提交进度</div>
              {ROB_LABELS.map(label=>{
                const r = snap.rob[label]||N;
                const done = r.committed&&!r.busy;
                const active = r.busy;
                return (
                  <div key={label} style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"3px"}}>
                    <span style={{color:P.muted,fontSize:"8px",minWidth:"32px"}}>{label}</span>
                    <div style={{flex:1,height:"8px",background:P.s2,borderRadius:"4px",overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:"4px",
                        background:done?P.orange:active?P.cyan:"transparent",
                        width:done?"100%":active?"50%":"0%",transition:"width 0.3s"}}/>
                    </div>
                    <span style={{fontSize:"8px",minWidth:"28px",textAlign:"right",
                      color:done?P.orange:active?P.cyan:P.muted}}>
                      {done?"提交":active?"在途":"—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{textAlign:"center",marginTop:"10px",fontSize:"8px",color:P.muted}}>
        步骤 {step+1}/{STEPS.length} · 点击数字按钮快速跳转 · ⭐ = 题目快照周期（周期5）
      </div>
    </div>
  );
}
