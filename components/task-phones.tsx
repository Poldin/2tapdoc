"use client";

import { useEffect, useRef, useState } from "react";
import { CharacterEmoji } from "@/components/character-emoji";

type Skin = "light" | "medium-light" | "medium" | "medium-dark" | "dark";

type Task = {
  id: string;
  chip: string;
  name: string;
  emoji: string;
  skinTone?: Skin;
  time: string;
  patient: string;
  draft: string;
  desk: string;
};

const tasks: Task[] = [
  {
    id: "agenda",
    chip: "Agenda",
    name: "Franco",
    emoji: "smileman",
    skinTone: "light",
    time: "09:14",
    patient: "Buongiorno, posso spostare l’appuntamento di giovedì? ho un imprevisto",
    draft: "Buongiorno, giovedì il dottore è pieno. Venerdì alle 9:30 è libero. Le confermo quello?",
    desk: "Sì, proponi venerdì. Non darlo per fissato finché non risponde.",
  },
  {
    id: "email",
    chip: "Email e WhatsApp",
    name: "Roberta",
    emoji: "womanraisinghand",
    skinTone: "light",
    time: "09:22",
    patient: "Mi mandate la fattura di marzo per il 730? Grazie",
    draft: "Buongiorno, le allego la fattura della visita del 12 marzo. La trova sia in email sia qui.",
    desk: "Allega il PDF e invia, su tutti e due i canali.",
  },
  {
    id: "promemoria",
    chip: "Promemoria e richiami",
    name: "Sofia",
    emoji: "womancurlyhair",
    skinTone: "dark",
    time: "09:31",
    patient: "Ok grazie, ci vediamo allora",
    draft: "Le ricordiamo la pulizia tra sei mesi, martedì 12 maggio alle 15:30. Risponda sì per tenerla.",
    desk: "Mandalo lunedì mattina, non di domenica.",
  },
  {
    id: "memoria",
    chip: "Memoria pazienti",
    name: "Marco",
    emoji: "manbeard",
    skinTone: "medium-light",
    time: "09:36",
    patient: "Sempre il pomeriggio, se si può. E la fattura come l’altra volta",
    draft: "Bianchi: preferisce il pomeriggio, viene col figlio, l’ultima volta ha chiesto la fattura.",
    desk: "Tienilo per il prossimo appuntamento. Non scriverle ora.",
  },
  {
    id: "richieste",
    chip: "Richieste pazienti",
    name: "Ginevra",
    emoji: "smilewoman",
    time: "09:41",
    patient: "Mi si è rotto un pezzo di dente, avete posto oggi??",
    draft: "Buongiorno, sono l’assistente dello studio. Oggi non ho un posto. Domani alle 11:20 sì. Lo tengo?",
    desk: "Non dire che non c’è posto. Dille che la richiamiamo entro un’ora.",
  },
  {
    id: "preventivi",
    chip: "Preventivi",
    name: "Ginevra",
    emoji: "smilewoman",
    time: "10:02",
    patient: "Salve quanto costa una pulizia?",
    draft: "Buongiorno, la pulizia è 80 euro. Vuole che le proponga un orario?",
    desk: "Sì, 80 euro. Invialo.",
  },
  {
    id: "recensioni",
    chip: "Recensioni",
    name: "Sofia",
    emoji: "womancurlyhair",
    skinTone: "dark",
    time: "18:05",
    patient: "Tutto bene, grazie dottore",
    draft: "Grazie per la visita di oggi. Se le va, una recensione ci aiuta: è un gesto, non un obbligo.",
    desk: "Solo a chi è venuto oggi, e una volta sola.",
  },
  {
    id: "fatture",
    chip: "Fatture",
    name: "Roberta",
    emoji: "womanraisinghand",
    skinTone: "light",
    time: "11:18",
    patient: "Mi serve la fattura della visita di marzo",
    draft: "Buongiorno, ecco la fattura n. 184 del 12 marzo, in allegato.",
    desk: "Controlla l’intestazione, poi invia.",
  },
];

export function TaskPhones() {
  const [active, setActive] = useState(tasks[0].id);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-task]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute("data-task");
        if (id) setActive(id);
      },
      { root, threshold: 0.6 },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  function choose(id: string) {
    setActive(id);
    const root = scroller.current;
    const card = root?.querySelector<HTMLElement>(`[data-task="${id}"]`);
    if (!card || !root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = card.offsetLeft - (root.clientWidth - card.clientWidth) / 2;
    root.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tasks.map((task) => {
          const selected = task.id === active;
          return (
            <button
              key={task.id}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(task.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                selected ? "border-violet bg-violet-soft text-ink" : "border-line bg-transparent text-ink"
              }`}
            >
              <CharacterEmoji id={task.emoji} skinTone={task.skinTone} size={20} />
              {task.chip}
            </button>
          );
        })}
      </div>
      <div
        ref={scroller}
        className="mt-6 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tasks.map((task) => (
          <article key={task.id} data-task={task.id} className="w-[17.5rem] shrink-0 snap-center sm:w-[19rem]">
            <Phone task={task} />
          </article>
        ))}
      </div>
    </div>
  );
}

function Phone({ task }: { task: Task }) {
  return (
    <div className="rounded-[2.2rem] bg-[#0e0c12] p-2">
      <div className="flex h-[34rem] flex-col overflow-hidden rounded-[1.8rem] bg-[#1a1720] text-[#f6f3ee]">
        <div className="mx-auto mt-2 h-5 w-24 rounded-b-2xl bg-black" />
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-white/80">
            <path d="M9 2.5 4.5 7 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <CharacterEmoji id={task.emoji} skinTone={task.skinTone} size={22} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.name}</span>
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" className="shrink-0 text-white/70">
            <rect x="2" y="3" width="11" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 12.2h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-4">
          <p className="text-center text-[11px] text-white/40">{task.time}</p>
          <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-[#322e3a] px-3 py-2 text-[13px] leading-5">{task.patient}</p>
          <div className="max-w-[92%]">
            <p className="mb-1 text-[10px] font-medium tracking-wide text-violet uppercase">Bozza</p>
            <p className="rounded-2xl rounded-bl-md bg-[#2a2433] px-3 py-2 text-[13px] leading-5 ring-1 ring-violet/40">{task.draft}</p>
          </div>
          <div className="flex justify-end">
            <p className="max-w-[88%] rounded-2xl rounded-br-md bg-[#f7f4f1] px-3 py-2 text-[13px] leading-5 text-[#1c1915]">
              {task.desk}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center text-lg text-white/70" aria-hidden="true">
            +
          </span>
          <span className="flex h-9 min-w-0 flex-1 items-center rounded-full bg-white/10 px-3 text-sm text-white/40">
            Scrivi a {task.name}
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-white/70">
            <rect x="6" y="1.5" width="4" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M4 7.5a4 4 0 0 0 8 0M8 11.5V14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
