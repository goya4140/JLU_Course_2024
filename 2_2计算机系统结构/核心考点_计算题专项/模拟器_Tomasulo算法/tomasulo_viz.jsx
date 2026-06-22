import { useState } from "react";

// ─────────────────────────────────────────
// 指令表（含完整时序）
// ─────────────────────────────────────────
const INSTS = [
  { name: "LD.D   F2, 00(R1)", issue: 1,  es: 2,  ee: 2,  mem: 3,    wb: 4    },
  { name: "ADD.D  F0, F4, F2", issue: 2,  es: 5,  ee: 8,  mem: null, wb: 9    },
  { name: "LD.D   F4, 03(R1)", issue: 3,  es: 4,  ee: 4,  mem: 5,    wb: 6    },
  { name: "MUL.D  F6, F4, F0", issue: 4,  es: 10, ee: 19, mem: null, wb: 20   },
  { name: "SUB.D  F0, F4, F2", issue: 5,  es: 9,  ee: 12, mem: null, wb: 13   },
  { name: "DIV.D  F8, F2, F0", issue: 6,  es: 20, ee: 39, mem: null, wb: 40   },
  { name: "ADD.D F10, F4, F0", issue: 10, es: 14, ee: 17, mem: null, wb: 18   },
  { name: "SUB.D  F4,F10, F6", issue: 14, es: 21, ee: 24, mem: null, wb: 25   },
  { name: "SD.D   F4, 05(R1)", issue: 15, es: 16, ee: 16, mem: 26,   wb: null },
];

// ─────────────────────────────────────────
// 各关键周期的快照
// RS 字段：{ busy, op, vj, qj(等待某RS), vk, qk(等待某RS), a, exec }
// qj/qk 有值 → 等待中（红色）；无 → vj/vk 有效（蓝色）
// qi  字段：{ F0..F10 }，"0" = 就绪，RS名 = 等待
// ─────────────────────────────────────────
const STEPS = [
  {
    cycle: 0, label: "初始状态",
    tag: "INIT",
    events: [
      { icon: "📋", text: "所有保留站（RS）均空闲，Busy = N" },
      { icon: "✅", text: "寄存器状态表 Qi 全为 0（所有寄存器数据就绪）" },
      { icon: "📌", text: "R1=C0, F0=05, F2=0B, F4=01（十六进制初值）" },
      { icon: "🗄️", text: "Mem[C0]=04, Mem[C3]=06, Mem[C5]=14" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:false},  ADD2:{busy:false},
      MUL1:{busy:false},  MUL2:{busy:false},
    },
    qi: {F0:"0",F2:"0",F4:"0",F6:"0",F8:"0",F10:"0"},
  },
  {
    cycle: 1, label: "周期 1",
    tag: "ISSUE",
    events: [
      { icon: "✅", text: "LD.D F2,00(R1) 流出 → LOAD1" },
      { icon: "→",  text: "R1=C0 就绪 → Vj=C0；偏移 A=00" },
      { icon: "📝", text: "Qi[F2] ← LOAD1（F2 将由 LOAD1 产生）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"LD.D", vj:"C0", a:"00"},
      LOAD2:{busy:false}, ADD1:{busy:false}, ADD2:{busy:false},
      MUL1:{busy:false},  MUL2:{busy:false},
    },
    qi: {F0:"0",F2:"LOAD1",F4:"0",F6:"0",F8:"0",F10:"0"},
  },
  {
    cycle: 2, label: "周期 2",
    tag: "EXEC+ISSUE",
    events: [
      { icon: "⚙️", text: "LD.D F2 执行：地址计算 A = C0+00 = C0" },
      { icon: "✅", text: "ADD.D F0,F4,F2 流出 → ADD1" },
      { icon: "→",  text: "F4=01 就绪 → Vj=01；Qi[F2]=LOAD1≠0 → Qk=LOAD1（等待）" },
      { icon: "📝", text: "Qi[F0] ← ADD1" },
    ],
    rs: {
      LOAD1:{busy:true, op:"LD.D", vj:"C0", a:"C0"},
      LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"01", qk:"LOAD1"},
      ADD2:{busy:false}, MUL1:{busy:false}, MUL2:{busy:false},
    },
    qi: {F0:"ADD1",F2:"LOAD1",F4:"0",F6:"0",F8:"0",F10:"0"},
  },
  {
    cycle: 3, label: "周期 3",
    tag: "MEM+ISSUE",
    events: [
      { icon: "💾", text: "LD.D F2 访存：读 Mem[C0]（结果=04，下周期写回）" },
      { icon: "✅", text: "LD.D F4,03(R1) 流出 → LOAD2" },
      { icon: "→",  text: "R1=C0 就绪 → Vj=C0；偏移 A=03" },
      { icon: "📝", text: "Qi[F4] ← LOAD2" },
    ],
    rs: {
      LOAD1:{busy:true, op:"LD.D", vj:"C0", a:"C0"},
      LOAD2:{busy:true, op:"LD.D", vj:"C0", a:"03"},
      ADD1:{busy:true, op:"ADD.D", vj:"01", qk:"LOAD1"},
      ADD2:{busy:false}, MUL1:{busy:false}, MUL2:{busy:false},
    },
    qi: {F0:"ADD1",F2:"LOAD1",F4:"LOAD2",F6:"0",F8:"0",F10:"0"},
  },
  {
    cycle: 4, label: "周期 4",
    tag: "WB+EXEC+ISSUE",
    events: [
      { icon: "📤", text: "LD.D F2 写结果：CDB 广播 F2=04 → ADD1.Vk←04，LOAD1 释放" },
      { icon: "🔓", text: "Qi[F2] ← 0（F2 就绪），WAR/WAW 解除" },
      { icon: "⚙️", text: "LD.D F4 执行：地址计算 A = C0+03 = C3" },
      { icon: "✅", text: "MUL.D F6,F4,F0 流出 → MUL1" },
      { icon: "→",  text: "Qi[F4]=LOAD2 → Qj=LOAD2；Qi[F0]=ADD1 → Qk=ADD1" },
      { icon: "📝", text: "Qi[F6] ← MUL1" },
    ],
    rs: {
      LOAD1:{busy:false},
      LOAD2:{busy:true, op:"LD.D", vj:"C0", a:"C3"},
      ADD1:{busy:true, op:"ADD.D", vj:"01", vk:"04"},
      ADD2:{busy:false},
      MUL1:{busy:true, op:"MUL.D", qj:"LOAD2", qk:"ADD1"},
      MUL2:{busy:false},
    },
    qi: {F0:"ADD1",F2:"0",F4:"LOAD2",F6:"MUL1",F8:"0",F10:"0"},
  },
  {
    cycle: 5, label: "周期 5",
    tag: "MEM+EXEC+ISSUE",
    events: [
      { icon: "💾", text: "LD.D F4 访存：读 Mem[C3]（结果=06，下周期写回）" },
      { icon: "⚙️", text: "ADD.D F0 操作数全就绪（Vj=01, Vk=04）→ 开始执行" },
      { icon: "✅", text: "SUB.D F0,F4,F2 流出 → ADD2" },
      { icon: "→",  text: "Qi[F4]=LOAD2 → Qj=LOAD2；F2=04就绪 → Vk=04，Qk=0" },
      { icon: "⚠️", text: "Qi[F0] ← ADD2（覆盖ADD1！WAW：MUL1 仍持有 Qk=ADD1，不受影响）" },
    ],
    rs: {
      LOAD1:{busy:false},
      LOAD2:{busy:true, op:"LD.D", vj:"C0", a:"C3"},
      ADD1:{busy:true, op:"ADD.D", vj:"01", vk:"04", exec:true},
      ADD2:{busy:true, op:"SUB.D", qj:"LOAD2", vk:"04"},
      MUL1:{busy:true, op:"MUL.D", qj:"LOAD2", qk:"ADD1"},
      MUL2:{busy:false},
    },
    qi: {F0:"ADD2",F2:"0",F4:"LOAD2",F6:"MUL1",F8:"0",F10:"0"},
  },
  {
    cycle: 6, label: "周期 6",
    tag: "WB+EXEC+ISSUE",
    events: [
      { icon: "📤", text: "LD.D F4 写结果：CDB 广播 F4=06 → LOAD2 释放" },
      { icon: "→",  text: "MUL1.Qj=LOAD2 → Vj←06；ADD2.Qj=LOAD2 → Vj←06" },
      { icon: "🔓", text: "Qi[F4] ← 0；SUB.D F0 两操作数均就绪（06, 04），等加法器空闲" },
      { icon: "⚙️", text: "ADD.D F0 执行中（周期 2/4）" },
      { icon: "✅", text: "DIV.D F8,F2,F0 流出 → MUL2" },
      { icon: "→",  text: "Qi[F2]=0 → Vj=04；Qi[F0]=ADD2 → Qk=ADD2（等SUB.D F0结果）" },
      { icon: "📝", text: "Qi[F8] ← MUL2" },
    ],
    rs: {
      LOAD1:{busy:false},
      LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"01", vk:"04", exec:true},
      ADD2:{busy:true, op:"SUB.D", vj:"06", vk:"04"},
      MUL1:{busy:true, op:"MUL.D", vj:"06", qk:"ADD1"},
      MUL2:{busy:true, op:"DIV.D", vj:"04", qk:"ADD2"},
    },
    qi: {F0:"ADD2",F2:"0",F4:"0",F6:"MUL1",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 9, label: "周期 9",
    tag: "WB+EXEC",
    events: [
      { icon: "📤", text: "ADD.D F0 写结果（01+04=05）→ ADD1 释放" },
      { icon: "⚠️", text: "Qi[F0]=ADD2 ≠ ADD1 → F0 寄存器暂不更新（WAW 保护正确！）" },
      { icon: "→",  text: "MUL1.Qk=ADD1 → Vk←05（MUL.D 从 CDB 获得所需的 F0 值）" },
      { icon: "⚙️", text: "ADD 单元空闲 + SUB.D F0 操作数就绪 → 开始执行（06-04）" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:false},
      ADD2:{busy:true, op:"SUB.D", vj:"06", vk:"04", exec:true},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05"},
      MUL2:{busy:true, op:"DIV.D", vj:"04", qk:"ADD2"},
    },
    qi: {F0:"ADD2",F2:"0",F4:"0",F6:"MUL1",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 10, label: "周期 10",
    tag: "EXEC+ISSUE",
    events: [
      { icon: "⚙️", text: "MUL.D F6 操作数全就绪（Vj=06, Vk=05）→ 开始执行" },
      { icon: "⚙️", text: "SUB.D F0 执行中（周期 2/4）" },
      { icon: "✅", text: "ADD.D F10,F4,F0 流出 → ADD1（ADD 单元已空闲）" },
      { icon: "→",  text: "Qi[F4]=0 → Vj=06；Qi[F0]=ADD2 → Qk=ADD2（等SUB.D F0结果）" },
      { icon: "📝", text: "Qi[F10] ← ADD1" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"06", qk:"ADD2"},
      ADD2:{busy:true, op:"SUB.D", vj:"06", vk:"04", exec:true},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", qk:"ADD2"},
    },
    qi: {F0:"ADD2",F2:"0",F4:"0",F6:"MUL1",F8:"MUL2",F10:"ADD1"},
  },
  {
    cycle: 13, label: "周期 13",
    tag: "WB",
    events: [
      { icon: "📤", text: "SUB.D F0 写结果（06-04=02）→ ADD2 释放" },
      { icon: "🔓", text: "Qi[F0]=ADD2 → 清零；F0←02 写入寄存器文件" },
      { icon: "→",  text: "ADD1.Qk=ADD2 → Vk←02（ADD.D F10 获得 F0=02，两操作数就绪）" },
      { icon: "→",  text: "MUL2.Qk=ADD2 → Vk←02（DIV.D 获得 F0=02，两操作数就绪）" },
      { icon: "⏳", text: "两者均需等待执行单元（加法器/乘法器）空闲" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"06", vk:"02"},
      ADD2:{busy:false},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02"},
    },
    qi: {F0:"0",F2:"0",F4:"0",F6:"MUL1",F8:"MUL2",F10:"ADD1"},
  },
  {
    cycle: 14, label: "周期 14",
    tag: "EXEC+ISSUE",
    events: [
      { icon: "⚙️", text: "ADD.D F10 操作数就绪 + 加法器空闲 → 开始执行（06+02）" },
      { icon: "✅", text: "SUB.D F4,F10,F6 流出 → ADD2" },
      { icon: "→",  text: "Qi[F10]=ADD1 → Qj=ADD1；Qi[F6]=MUL1 → Qk=MUL1" },
      { icon: "📝", text: "Qi[F4] ← ADD2" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"06", vk:"02", exec:true},
      ADD2:{busy:true, op:"SUB.D", qj:"ADD1", qk:"MUL1"},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02"},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"MUL1",F8:"MUL2",F10:"ADD1"},
  },
  {
    cycle: 15, label: "周期 15",
    tag: "ISSUE",
    events: [
      { icon: "✅", text: "SD.D F4,05(R1) 流出 → LOAD1" },
      { icon: "→",  text: "R1=C0 就绪 → Vj=C0；偏移 A=05" },
      { icon: "→",  text: "Qi[F4]=ADD2 → Qk=ADD2（等待 SUB.D F4 的结果数据）" },
      { icon: "⚙️", text: "ADD.D F10 执行中（周期 2/4）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", qk:"ADD2", a:"05"},
      LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"06", vk:"02", exec:true},
      ADD2:{busy:true, op:"SUB.D", qj:"ADD1", qk:"MUL1"},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02"},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"MUL1",F8:"MUL2",F10:"ADD1"},
  },
  {
    cycle: 16, label: "周期 16",
    tag: "EXEC",
    events: [
      { icon: "⚙️", text: "SD.D 地址计算：A = C0+05 = C5（地址已就绪，但数据 F4 尚未到位）" },
      { icon: "⚙️", text: "ADD.D F10 执行中（周期 3/4）" },
      { icon: "⚙️", text: "MUL.D F6 执行中（周期 7/10）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", qk:"ADD2", a:"C5"},
      LOAD2:{busy:false},
      ADD1:{busy:true, op:"ADD.D", vj:"06", vk:"02", exec:true},
      ADD2:{busy:true, op:"SUB.D", qj:"ADD1", qk:"MUL1"},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02"},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"MUL1",F8:"MUL2",F10:"ADD1"},
  },
  {
    cycle: 18, label: "周期 18",
    tag: "WB",
    events: [
      { icon: "📤", text: "ADD.D F10 写结果（06+02=08）→ ADD1 释放" },
      { icon: "🔓", text: "Qi[F10]=ADD1 → 清零；F10←08" },
      { icon: "→",  text: "ADD2.Qj=ADD1 → Vj←08（SUB.D F4 获得 F10，仍等 MUL1 的 F6）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", qk:"ADD2", a:"C5"},
      LOAD2:{busy:false},
      ADD1:{busy:false},
      ADD2:{busy:true, op:"SUB.D", vj:"08", qk:"MUL1"},
      MUL1:{busy:true, op:"MUL.D", vj:"06", vk:"05", exec:true},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02"},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"MUL1",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 20, label: "周期 20",
    tag: "WB+EXEC",
    events: [
      { icon: "📤", text: "MUL.D F6 写结果（06×05=30=1Eh）→ MUL1 释放" },
      { icon: "🔓", text: "Qi[F6]=MUL1 → 清零；F6←1E" },
      { icon: "→",  text: "ADD2.Qk=MUL1 → Vk←1E（SUB.D F4 两操作数全就绪！）" },
      { icon: "⚙️", text: "乘法器空闲 + DIV.D 操作数全就绪 → 开始执行（04÷02）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", qk:"ADD2", a:"C5"},
      LOAD2:{busy:false},
      ADD1:{busy:false},
      ADD2:{busy:true, op:"SUB.D", vj:"08", vk:"1E"},
      MUL1:{busy:false},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02", exec:true},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"0",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 21, label: "周期 21",
    tag: "EXEC",
    events: [
      { icon: "⚙️", text: "加法器空闲 + SUB.D F4 操作数就绪 → 开始执行（08-1E）" },
      { icon: "⚙️", text: "DIV.D F8 执行中（周期 2/20）" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", qk:"ADD2", a:"C5"},
      LOAD2:{busy:false},
      ADD1:{busy:false},
      ADD2:{busy:true, op:"SUB.D", vj:"08", vk:"1E", exec:true},
      MUL1:{busy:false},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02", exec:true},
    },
    qi: {F0:"0",F2:"0",F4:"ADD2",F6:"0",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 25, label: "周期 25",
    tag: "WB",
    events: [
      { icon: "📤", text: "SUB.D F4 写结果（08-1E）→ ADD2 释放" },
      { icon: "🔓", text: "Qi[F4]=ADD2 → 清零；F4←(08-1E)" },
      { icon: "→",  text: "LOAD1.Qk=ADD2 → Vk←F4结果（SD.D 存储数据终于就绪！）" },
      { icon: "⏳", text: "SD.D 地址(C5) + 数据均就绪，下周期执行访存" },
    ],
    rs: {
      LOAD1:{busy:true, op:"SD.D", vj:"C0", vk:"F4 val", a:"C5"},
      LOAD2:{busy:false},
      ADD1:{busy:false},
      ADD2:{busy:false},
      MUL1:{busy:false},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02", exec:true},
    },
    qi: {F0:"0",F2:"0",F4:"0",F6:"0",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 26, label: "周期 26",
    tag: "MEM",
    events: [
      { icon: "💾", text: "SD.D F4 访存：将 F4 值写入 Mem[C5]" },
      { icon: "✅", text: "Store 无写结果阶段（WB=null）→ LOAD1 释放，SD.D 完成" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:false},  ADD2:{busy:false},
      MUL1:{busy:false},
      MUL2:{busy:true, op:"DIV.D", vj:"04", vk:"02", exec:true},
    },
    qi: {F0:"0",F2:"0",F4:"0",F6:"0",F8:"MUL2",F10:"0"},
  },
  {
    cycle: 40, label: "周期 40",
    tag: "DONE",
    events: [
      { icon: "📤", text: "DIV.D F8 写结果（04÷02=02）→ MUL2 释放" },
      { icon: "🔓", text: "Qi[F8]=MUL2 → 清零；F8←02" },
      { icon: "🎉", text: "全部 9 条指令执行完毕，所有保留站空闲，程序结束！" },
    ],
    rs: {
      LOAD1:{busy:false}, LOAD2:{busy:false},
      ADD1:{busy:false},  ADD2:{busy:false},
      MUL1:{busy:false},  MUL2:{busy:false},
    },
    qi: {F0:"0",F2:"0",F4:"0",F6:"0",F8:"0",F10:"0"},
  },
];

const RS_LABELS = ["LOAD1","LOAD2","ADD1","ADD2","MUL1","MUL2"];
const QI_REGS   = ["F0","F2","F4","F6","F8","F10"];

const TAG_COLORS = {
  INIT:       { bg:"#1e3a5f", fg:"#7dd3fc" },
  ISSUE:      { bg:"#14532d", fg:"#86efac" },
  EXEC:       { bg:"#713f12", fg:"#fde68a" },
  WB:         { bg:"#4c1d95", fg:"#c4b5fd" },
  "EXEC+ISSUE":   { bg:"#164e63", fg:"#a5f3fc" },
  "WB+EXEC":      { bg:"#581c87", fg:"#d8b4fe" },
  "WB+EXEC+ISSUE":{ bg:"#1e3a5f", fg:"#a5f3fc" },
  "MEM+ISSUE":    { bg:"#1c4532", fg:"#6ee7b7" },
  "MEM+EXEC+ISSUE":{ bg:"#133929", fg:"#6ee7b7" },
  "WB+EXEC+MEM":  { bg:"#3b0764", fg:"#e9d5ff" },
  MEM:        { bg:"#0f3460", fg:"#93c5fd" },
  DONE:       { bg:"#14532d", fg:"#4ade80" },
};

function getInstStatus(inst, cycle) {
  if (inst.issue > cycle) return null;
  let execStr = null;
  if (inst.es <= cycle) {
    if (inst.ee <= cycle) {
      execStr = inst.es === inst.ee ? String(inst.es) : `${inst.es}–${inst.ee}`;
    } else {
      execStr = `${inst.es}–…`;
    }
  }
  const memStr = inst.mem != null && inst.mem <= cycle ? String(inst.mem) : null;
  const wbStr  = inst.wb  != null && inst.wb  <= cycle ? String(inst.wb)  : null;
  const done   = (inst.wb != null && inst.wb <= cycle)
              || (inst.wb == null && inst.mem != null && inst.mem <= cycle);
  return { issue: String(inst.issue), exec: execStr, mem: memStr, wb: wbStr, done };
}

export default function App() {
  const [step, setStep] = useState(0);
  const snap = STEPS[step];
  const c    = snap.cycle;

  // ── palette ──
  const P = {
    bg:      "#0b0e18",
    s1:      "#111827",
    s2:      "#1a2236",
    border:  "#263048",
    text:    "#e2e8f0",
    muted:   "#4b5a72",
    cyan:    "#38bdf8",
    green:   "#4ade80",
    yellow:  "#fbbf24",
    red:     "#f87171",
    purple:  "#a78bfa",
    orange:  "#fb923c",
  };

  const tagColor = TAG_COLORS[snap.tag] || { bg:"#1e293b", fg:"#94a3b8" };

  return (
    <div style={{
      fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace",
      background: P.bg, color: P.text,
      padding: "16px", minHeight: "100vh",
      maxWidth: "920px", margin: "0 auto",
      fontSize: "12px",
    }}>

      {/* ── Header ── */}
      <div style={{ textAlign:"center", marginBottom:"12px" }}>
        <div style={{ fontSize:"17px", fontWeight:"700", color: P.cyan, letterSpacing:"0.04em" }}>
          TOMASULO 算法 · 完整状态演示
        </div>
        <div style={{ color: P.muted, fontSize:"10px", marginTop:"3px" }}>
          单流出 ｜ LOAD/STORE×2 ｜ 浮点加减×2 ｜ 浮点乘除×2 ｜ 共 9 条指令
        </div>
      </div>

      {/* ── Navigation ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px", gap:"10px" }}>
        <button
          onClick={() => setStep(s => Math.max(0, s-1))}
          disabled={step === 0}
          style={{
            padding:"6px 16px", border:"1px solid "+P.border, borderRadius:"6px",
            background: step>0 ? P.s2 : P.s1,
            color: step>0 ? P.text : P.muted, cursor: step>0?"pointer":"default",
            fontFamily:"inherit", fontSize:"11px",
          }}>← 上一步</button>

        <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ fontSize:"18px", fontWeight:"700", color: P.yellow }}>
            {snap.label}
          </div>
          <div style={{
            marginTop:"3px", padding:"2px 10px", borderRadius:"99px",
            background: tagColor.bg, color: tagColor.fg,
            fontSize:"9px", fontWeight:"600", letterSpacing:"0.08em",
          }}>
            {snap.tag}
          </div>
        </div>

        <button
          onClick={() => setStep(s => Math.min(STEPS.length-1, s+1))}
          disabled={step === STEPS.length-1}
          style={{
            padding:"6px 16px", border:"1px solid "+P.border, borderRadius:"6px",
            background: step<STEPS.length-1 ? P.s2 : P.s1,
            color: step<STEPS.length-1 ? P.text : P.muted, cursor: step<STEPS.length-1?"pointer":"default",
            fontFamily:"inherit", fontSize:"11px",
          }}>下一步 →</button>
      </div>

      {/* ── Progress dots ── */}
      <div style={{ display:"flex", justifyContent:"center", gap:"3px", marginBottom:"10px", flexWrap:"wrap" }}>
        {STEPS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} title={`周期 ${s.cycle}`}
            style={{
              width:"30px", height:"18px", border:"none", borderRadius:"3px",
              background: i===step ? P.cyan : (i<step ? "#1e3a5f" : P.s2),
              color: i===step ? "#000" : P.muted,
              fontSize:"8px", cursor:"pointer", fontFamily:"inherit",
              fontWeight: i===step?"700":"400",
            }}>
            {s.cycle}
          </button>
        ))}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height:"2px", background: P.s2, borderRadius:"2px", marginBottom:"10px" }}>
        <div style={{
          height:"100%", background: P.cyan, borderRadius:"2px",
          width:`${(step/(STEPS.length-1))*100}%`, transition:"width 0.25s ease",
        }}/>
      </div>

      {/* ── Events ── */}
      <div style={{
        background: P.s1, borderRadius:"8px", padding:"10px 14px",
        marginBottom:"10px", borderLeft:`3px solid ${P.cyan}`,
      }}>
        <div style={{ fontSize:"9px", color: P.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px" }}>
          本周期事件
        </div>
        {snap.events.map((e, i) => (
          <div key={i} style={{ display:"flex", gap:"6px", marginTop:"3px", alignItems:"flex-start" }}>
            <span style={{ fontSize:"11px", minWidth:"16px" }}>{e.icon}</span>
            <span style={{ fontSize:"11px", color: P.text, lineHeight:"1.5" }}>{e.text}</span>
          </div>
        ))}
      </div>

      {/* ── ① Instruction Status ── */}
      <div style={{ background: P.s1, borderRadius:"8px", padding:"10px 12px", marginBottom:"10px" }}>
        <div style={{ fontSize:"11px", color: P.cyan, fontWeight:"700", marginBottom:"8px" }}>
          ① 指令执行状态表
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {["指令","流出","执行(周期)","访存","写结果"].map((h, hi) => (
                <th key={h} style={{
                  padding:"3px 6px", borderBottom:`1px solid ${P.border}`,
                  fontSize:"9px", color: P.muted, fontWeight:"600",
                  textAlign: hi===0?"left":"center",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INSTS.map((inst, i) => {
              const st = getInstStatus(inst, c);
              const notYet = !st;
              const done   = st?.done;
              const rowBg  = !notYet && !done ? "#0f1f3a" : "transparent";
              const textC  = notYet ? P.muted : (done ? "#374151" : P.text);
              const memDisplay = inst.mem == null ? "null" : (st?.mem ?? "—");
              const wbDisplay  = inst.wb  == null ? "null" : (st?.wb  ?? "—");
              return (
                <tr key={i} style={{ background: rowBg }}>
                  <td style={{ padding:"3px 6px", fontSize:"10px", color: textC, fontFamily:"inherit" }}>
                    {inst.name}
                  </td>
                  <td style={{ padding:"3px 6px", textAlign:"center", fontSize:"10px",
                    color: st?.issue ? P.green : P.muted, fontWeight: st?.issue?"600":"400" }}>
                    {st?.issue ?? "—"}
                  </td>
                  <td style={{ padding:"3px 6px", textAlign:"center", fontSize:"10px",
                    color: st?.exec ? P.yellow : P.muted }}>
                    {st?.exec ?? "—"}
                  </td>
                  <td style={{ padding:"3px 6px", textAlign:"center", fontSize:"10px",
                    color: st?.mem ? P.purple : (inst.mem==null&&st ? "#4b5a72" : P.muted) }}>
                    {notYet ? "—" : memDisplay}
                  </td>
                  <td style={{ padding:"3px 6px", textAlign:"center", fontSize:"10px",
                    color: st?.wb ? P.red : (inst.wb==null&&st ? "#4b5a72" : P.muted) }}>
                    {notYet ? "—" : wbDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── ② RS + ③ Qi ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:"10px" }}>

        {/* ② RS Table */}
        <div style={{ background: P.s1, borderRadius:"8px", padding:"10px 12px" }}>
          <div style={{ fontSize:"11px", color: P.cyan, fontWeight:"700", marginBottom:"8px" }}>
            ② 保留站 / 缓冲器状态
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {["标签","Busy","Op","Vj / Qj","Vk / Qk","A"].map(h => (
                  <th key={h} style={{
                    padding:"2px 4px", borderBottom:`1px solid ${P.border}`,
                    fontSize:"9px", color: P.muted, fontWeight:"600", textAlign:"center",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RS_LABELS.map(label => {
                const r      = snap.rs[label];
                const isExec = r.busy && r.exec;
                const rowBg  = r.busy ? (isExec ? "#0d2a1a" : "#111c2e") : "transparent";
                const vjQj   = r.qj
                  ? <span style={{color:P.red,fontWeight:"600"}}>Q:{r.qj}</span>
                  : r.vj
                    ? <span style={{color:P.cyan}}>{r.vj}</span>
                    : <span style={{color:P.muted}}>—</span>;
                const vkQk   = r.qk
                  ? <span style={{color:P.red,fontWeight:"600"}}>Q:{r.qk}</span>
                  : r.vk
                    ? <span style={{color:P.cyan}}>{r.vk}</span>
                    : <span style={{color:P.muted}}>—</span>;
                return (
                  <tr key={label} style={{ background: rowBg }}>
                    <td style={{ padding:"3px 5px", fontSize:"10px", color: r.busy?P.yellow:P.muted, fontWeight:"700" }}>
                      {label}
                    </td>
                    <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"10px",
                      color: r.busy ? P.green : P.muted, fontWeight: r.busy?"600":"400" }}>
                      {r.busy?"Y":"N"}
                    </td>
                    <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"10px", color: P.purple }}>
                      {r.op ?? ""}
                    </td>
                    <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"10px" }}>{vjQj}</td>
                    <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"10px" }}>{vkQk}</td>
                    <td style={{ padding:"3px 5px", textAlign:"center", fontSize:"10px", color: P.muted }}>
                      {r.a ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{ marginTop:"8px", display:"flex", gap:"10px", flexWrap:"wrap" }}>
            {[
              [P.cyan,    "V字段(就绪)"],
              [P.red,     "Q字段(等待)"],
              ["#0d2a1a", "▌执行中"],
            ].map(([col, label], i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"4px", fontSize:"9px", color: P.muted }}>
                <span style={{
                  width:"10px", height:"10px", borderRadius:"2px",
                  background: i===2 ? col : "transparent",
                  border: i<2 ? `1px solid ${col}` : "none",
                  display:"inline-block",
                }}/>
                <span style={{ color: i===2 ? "#4ade80" : col }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ③ Qi + summary */}
        <div style={{ background: P.s1, borderRadius:"8px", padding:"10px 12px", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:"11px", color: P.cyan, fontWeight:"700", marginBottom:"8px" }}>
            ③ 寄存器状态表 Qi
          </div>

          {/* Qi grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"6px", marginBottom:"10px" }}>
            {QI_REGS.map(reg => {
              const val   = snap.qi[reg];
              const ready = val === "0";
              return (
                <div key={reg} style={{
                  background: ready ? "#0a1f0f" : "#200a3a",
                  border: `1px solid ${ready ? "#166534" : "#4c1d95"}`,
                  borderRadius:"6px", padding:"6px 8px", textAlign:"center",
                }}>
                  <div style={{ fontSize:"9px", color: P.muted, marginBottom:"2px" }}>{reg}</div>
                  <div style={{
                    fontSize:"12px", fontWeight:"700",
                    color: ready ? P.green : P.purple,
                  }}>
                    {ready ? "0" : val}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active RS summary */}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"9px", color: P.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"6px" }}>
              活跃 RS 状态一览
            </div>
            {RS_LABELS.filter(l => snap.rs[l].busy).length === 0 ? (
              <div style={{ fontSize:"10px", color: P.muted, fontStyle:"italic" }}>（所有保留站空闲）</div>
            ) : (
              RS_LABELS.filter(l => snap.rs[l].busy).map(label => {
                const r = snap.rs[label];
                const allReady = !r.qj && !r.qk;
                const statusIcon = r.exec ? "▶" : (allReady ? "✓" : "⏳");
                const statusColor = r.exec ? P.green : (allReady ? P.yellow : P.red);
                return (
                  <div key={label} style={{
                    display:"flex", alignItems:"center", gap:"6px",
                    padding:"4px 6px", marginBottom:"4px",
                    background: P.s2, borderRadius:"4px",
                    border:`1px solid ${P.border}`,
                  }}>
                    <span style={{ color: statusColor, fontSize:"11px", minWidth:"12px" }}>{statusIcon}</span>
                    <span style={{ color: P.yellow, fontWeight:"700", fontSize:"10px", minWidth:"42px" }}>{label}</span>
                    <span style={{ color: P.purple, fontSize:"10px" }}>{r.op}</span>
                    <span style={{ flex:1, textAlign:"right", fontSize:"9px" }}>
                      {r.qj
                        ? <span style={{color:P.red}}>等{r.qj}</span>
                        : <span style={{color:P.cyan}}>V:{r.vj??""}</span>
                      }
                      {" , "}
                      {r.qk
                        ? <span style={{color:P.red}}>等{r.qk}</span>
                        : r.vk != null
                          ? <span style={{color:P.cyan}}>V:{r.vk}</span>
                          : <span style={{color:P.muted}}>—</span>
                      }
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Qi legend */}
          <div style={{ marginTop:"8px", display:"flex", gap:"12px", fontSize:"9px" }}>
            <span><span style={{color:P.green}}>●</span> <span style={{color:P.muted}}>0 = 就绪</span></span>
            <span><span style={{color:P.purple}}>●</span> <span style={{color:P.muted}}>RS名 = 等待中</span></span>
          </div>
        </div>
      </div>

      {/* ── footer ── */}
      <div style={{ textAlign:"center", marginTop:"12px", fontSize:"9px", color: P.muted }}>
        步骤 {step+1} / {STEPS.length} &nbsp;·&nbsp; 快捷跳转：点击上方数字按钮
      </div>
    </div>
  );
}
