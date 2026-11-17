export const studioTemplates = [
  ['landing','Landing page','Present a product, its benefits, and pricing.',['Features','How it works','Pricing']],
  ['dashboard','Dashboard','Set up a dashboard with metrics and activity.',['Overview','Recent activity','Reports']],
  ['store','E-commerce','Start a storefront with products and a cart.',['Collection','Product details','Checkout']],
  ['portfolio','Portfolio','Showcase selected work and introduce yourself.',['Selected work','About','Contact']],
  ['blog','Blog / CMS','Organize articles and categories.',['Latest articles','Topics','Archive']],
  ['todo','Todo / Task Manager','Organize work into a task board.',['To do','In progress','Done']],
  ['chat','Chat Application','Plan a conversation list and inbox.',['Conversations','Messages','New message']],
  ['restaurant','Restaurant / Food Ordering','Display a menu with an order summary.',['Menu','Popular dishes','Your order']],
  ['fitness','Fitness Tracker','Track workouts and progress.',['Training log','Exercises','Progress']],
  ['social','Social Media Feed','Set up a feed, profile, and activity.',['Feed','Discover','Profile']],
  ['calendar','Calendar / Scheduling','Present availability and scheduled events.',['Calendar','Availability','Upcoming']],
  ['weather','Weather App','Lay out a forecast and location search.',['Current conditions','7-day forecast','Locations']]
];
export const studioThemes = ['indigo','forest','amber','rose'];

export function starterProject(brief, idea) {
  const template = studioTemplates.find(item => item[0] === idea) || studioTemplates[0];
  const name = brief.split(/\r?\n|[.!?]\s/,1)[0].trim().slice(0,80) || template[1];
  return { name, headline:name, summary:brief.slice(0,1000), template:template[0], theme:'indigo',
    blocks:template[3].map(title => ({ title, body:'' })) };
}
