/**
 * Quality-control checklists / ServiceTemplates (§6.12). Crews complete these on
 * site; this is how quality stays consistent across crews and how we defend
 * against disputes. Admin can require photo evidence on specified items.
 *
 * The end-of-tenancy template MUST mirror what inventory clerks assess — inside
 * cupboards, appliance interiors, limescale, skirting boards, interior windows,
 * extractor fans — because it is the evidence in a deposit dispute.
 */

export interface ChecklistItem {
  label: string;
  requiresPhoto: boolean;
  order: number;
  /** Optional grouping (Kitchen, Bathrooms, …) for the crew UI. */
  group?: string;
}

export interface ServiceTemplateDef {
  serviceSlug: string;
  name: string;
  items: ChecklistItem[];
}

function items(defs: Array<[string, string, boolean]>): ChecklistItem[] {
  // [group, label, requiresPhoto]
  return defs.map(([group, label, requiresPhoto], i) => ({ group, label, requiresPhoto, order: i + 1 }));
}

export const serviceTemplates: ServiceTemplateDef[] = [
  {
    serviceSlug: "end-of-tenancy-cleaning",
    name: "End of tenancy — inventory-aligned checklist",
    items: items([
      ["Kitchen", "Oven interior, racks, door glass and grill degreased", true],
      ["Kitchen", "Hob, extractor fan and filter cleaned", true],
      ["Kitchen", "Inside and outside of all cupboards and drawers", true],
      ["Kitchen", "Fridge/freezer defrosted and cleaned inside (if present)", true],
      ["Kitchen", "Sink, taps and limescale descaled", false],
      ["Kitchen", "Skirting boards, floor edges and behind appliances", false],
      ["Bathrooms", "Limescale removed from taps, showerheads, screens, tiles", true],
      ["Bathrooms", "Toilet cleaned and descaled, including base and behind", true],
      ["Bathrooms", "Grout and sealant free of mould", true],
      ["Bathrooms", "Mirrors, glass and chrome polished", false],
      ["Bathrooms", "Extractor fan cover dusted", false],
      ["Living & bedrooms", "Skirting, door frames, switches and sockets wiped", false],
      ["Living & bedrooms", "Interior windows, sills and tracks cleaned", true],
      ["Living & bedrooms", "Inside fitted wardrobes and cupboards", true],
      ["Living & bedrooms", "Carpets vacuumed (and cleaned if booked)", false],
      ["Whole property", "Cobwebs removed from ceilings and corners", false],
      ["Whole property", "Light fittings and lampshades dusted", false],
      ["Whole property", "Bin storage areas cleaned", false],
      ["Handover", "Final walk-through photos of every room", true],
    ]),
  },
  {
    serviceSlug: "deep-cleaning",
    name: "Deep clean checklist",
    items: items([
      ["Kitchen", "Appliance exteriors and splashbacks degreased", false],
      ["Kitchen", "Limescale removed from taps and sink", false],
      ["Kitchen", "Cupboard fronts and handles cleaned", false],
      ["Bathrooms", "Descale taps, showerheads, screens and tiles", true],
      ["Bathrooms", "Toilet, grout and sealant deep-cleaned", false],
      ["Living & bedrooms", "Skirting, edges and door frames wiped", false],
      ["Living & bedrooms", "Interior windows and sills", false],
      ["Whole property", "Cobwebs, vents and light fittings dusted", false],
      ["Whole property", "Floors vacuumed and mopped", false],
    ]),
  },
  {
    serviceSlug: "domestic-cleaning",
    name: "Regular domestic checklist",
    items: items([
      ["Kitchen", "Surfaces, hob and sink cleaned", false],
      ["Kitchen", "Appliance fronts wiped", false],
      ["Bathrooms", "Toilet, sink, shower/bath cleaned and descaled", false],
      ["Bathrooms", "Mirrors and chrome polished", false],
      ["Living & bedrooms", "Dusting, surfaces and touchpoints", false],
      ["Whole property", "Floors vacuumed and mopped", false],
      ["Whole property", "Bins emptied", false],
    ]),
  },
  {
    serviceSlug: "after-builders-cleaning",
    name: "After builders checklist",
    items: items([
      ["Dust removal", "Fine construction dust removed from all surfaces, high and low", true],
      ["Dust removal", "Vents, sills, ledges and radiators de-dusted", false],
      ["Residue", "Paint, plaster and adhesive residue removed", true],
      ["Glazing", "Windows, frames and glass cleaned inside", false],
      ["Floors", "Debris cleared, floors vacuumed and washed", false],
      ["Handover", "Final photos of each cleaned area", true],
    ]),
  },
];

export const templateForService = (slug: string): ServiceTemplateDef | undefined =>
  serviceTemplates.find((t) => t.serviceSlug === slug);
