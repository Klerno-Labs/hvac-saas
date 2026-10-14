export const resources = [
  { path: '/resources/hvac-invoice-template', type: 'Free template', title: 'HVAC invoice template', description: 'Build an itemized service invoice, check the totals, and print or save a PDF in your browser.' },
  { path: '/resources/hvac-estimate-template', type: 'Free template', title: 'HVAC estimate template', description: 'Define the scope, exclusions, pricing and approval details before work begins.' },
  { path: '/tools/hvac-job-pricing-calculator', type: 'Free calculator', title: 'HVAC job pricing calculator', description: 'Compare labor and material costs with a target margin, markup and allocated overhead.' },
  { path: '/resources/hvac-software-checklist', type: 'Buying guide', title: 'HVAC software evaluation checklist', description: 'Test a real job workflow, check the full cost, and plan how to bring your records with you.' },
  { path: '/tools/paperwork-calculator', type: 'Free calculator', title: 'Paperwork time calculator', description: 'Estimate your current administrative workload using your own jobs and minutes per job.' },
] as const

export const acquisitionPaths = ['/resources', '/hvac-estimating-software', '/hvac-invoicing-software', ...resources.map(resource => resource.path)] as const
