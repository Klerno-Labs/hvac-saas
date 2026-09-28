import { ChevronDown } from 'lucide-react';
/** Native disclosure stays keyboard accessible and works without JavaScript. */
export function FaqAccordion({faqs}: {faqs: {q: string; a: string}[]}) {
 return <div className="faq-list">{faqs.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={20} aria-hidden="true" /></summary><p>{item.a}</p></details>)}</div>;
}
