// Joey Housing License Agreement (CA): text copied word for word from JoeyCo's template (.docx). Generated once, then reviewed.
// Don't edit the wording here without a new version from legal, and bump the template's version
// when it changes, since the version is stored with every sent copy.
//
// Markup: **bold**, __underline__, {{field}} or {{field?cond}} for a value, [[cond]] for a ☐/☒ box.
// cond is "key", "key=value" or "key!=value". See lib/agreements/render.ts.

import type { Block } from "@/lib/agreements/types";

export const BODY: Block[] = [
  {
    "t": "title",
    "text": "Joey Housing License Agreement "
  },
  {
    "t": "p",
    "text": "This Joey Housing License Agreement (this “__Agreement__”) is made as of {{made_date}} by and between: {{joey_name}} (“__Joey__”) and {{host_name}} (“__Host__”), together, the “Parties,” in connection with Joey’s employment by Host. The lodging provided under this Agreement is for the convenience of the Host and is conditioned upon continued employment. This Agreement does not create a tenancy or leasehold interest."
  },
  {
    "t": "p",
    "text": "NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, the parties hereby agree as follows:"
  },
  {
    "t": "p",
    "text": "**I. PREMISES.** The residence being licensed to the occupant in this Agreement (the “__Premises__”) is described as:"
  },
  {
    "t": "p",
    "text": "Address: {{premises_address}}"
  },
  {
    "t": "p",
    "text": "Bedrooms: {{bedrooms}}"
  },
  {
    "t": "p",
    "text": "Bathrooms: {{bathrooms}}"
  },
  {
    "t": "p",
    "text": "Common Areas: {{common_areas}}"
  },
  {
    "t": "p",
    "text": "Private Areas: {{private_areas}}"
  },
  {
    "t": "p",
    "text": "Furnishing: (select one)"
  },
  {
    "t": "p",
    "text": "[[furnished=yes]] Furnished. The Premises are furnished with the following: {{furnished_items?furnished=yes}}"
  },
  {
    "t": "p",
    "text": "[[furnished=no]] Not Furnished. The Premises are not furnished."
  },
  {
    "t": "p",
    "text": "It is recognized that the property is managed by Host. Joey acknowledges Host as the property owner and primary resident, with full access to and use of all common areas. Host reserves the right to enter Joey’s room upon reasonable notice or, in cases of emergency, without notice. Joey acknowledges that occupancy does not confer exclusive possession and that Host’s entry shall not constitute a breach of privacy under Civil Code §1954."
  },
  {
    "t": "p",
    "text": "**II. TERM AND TERMINATION.** This Agreement shall be considered a: (select one)"
  },
  {
    "t": "p",
    "text": "[[term_mode=fixed]] Fixed Term. The Joey shall be allowed to occupy the Premises starting on {{term_start?term_mode=fixed}}, and ending on {{term_end?term_mode=fixed}} (the “__Term__”)."
  },
  {
    "t": "p",
    "text": "[[term_mode=monthly]] Month-to-Month Term. The Joey shall be allowed to occupy the Premises on a month-to-month arrangement starting on {{term_start?term_mode=monthly}}, and ending upon notice given pursuant to California law (the “__Term__”)."
  },
  {
    "t": "p",
    "text": "In either case and in accordance with applicable law, at any time either party may terminate this housing arrangement with 30 days’ written notice. Notwithstanding the foregoing, because Host and Joey have an employment relationship, additional termination rights are available to Host:"
  },
  {
    "t": "p",
    "text": "**If Joey ceases to provide agreed services or the services are terminated by Host, Host may terminate the occupancy with written notice of not less than 7 days. Upon the effective date of such notice, Joey agrees to vacate the premises promptly. Joey acknowledges that this license is not a tenancy, and Host retains full legal possession of the dwelling.**"
  },
  {
    "t": "p",
    "text": "**III. RENT AND SERVICES ($). **The Joey will pay: (select one)"
  },
  {
    "t": "p",
    "text": "[[rent_mode=amount]] An amount equal to {{rent_cents?rent_mode=amount}} on the: (check one)"
  },
  {
    "t": "p",
    "text": "[[rent_mode=amount]] {{rent_due_day?rent_mode=amount}} day of each month (the “Due Date”).",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[rent_mode=other]] Other: {{rent_other?rent_mode=other}}."
  },
  {
    "t": "p",
    "text": "The aforementioned amount shall be known as the “__Rent__.”"
  },
  {
    "t": "p",
    "text": "Joey shall perform the following agreed services for Host: (specify duties, scope, and schedule)"
  },
  {
    "t": "p",
    "text": "See Exhibit A of the associated Employment Offer Letter between the Parties"
  },
  {
    "t": "p",
    "text": "**IV. PAYMENT INSTRUCTIONS.** Rent shall be paid in the following manner (e.g., bank transfer, check, Venmo, Zelle): {{payment_method}}."
  },
  {
    "t": "p",
    "text": "**V. LATE FEE.** If Rent is not paid on the Due Date, a late fee of five percent (5%) shall be applied after Rent is more than {{late_days}} day(s) late (the “__Late Fee__”)."
  },
  {
    "t": "p",
    "text": "**VI. SECURITY DEPOSIT.** A “__Security Deposit__” is: (select one)"
  },
  {
    "t": "p",
    "text": "[[deposit_mode=none]] Not required."
  },
  {
    "t": "p",
    "text": "[[deposit_mode!=none]] Is required in an amount equal to: (select one)"
  },
  {
    "t": "p",
    "text": "[[deposit_mode=one_month]] One (1) month’s Rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[deposit_mode=other]] Other: {{deposit_other?deposit_mode=other}}.",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "The Security Deposit shall be held for the faithful performance of the Joey under the terms and conditions of this Agreement. Payment of the Security Deposit is due upon the execution of this Agreement. This Security Deposit shall not be credited towards any Rent unless Host gives their prior written consent."
  },
  {
    "t": "p",
    "text": "**VII. RETURNING SECURITY DEPOSIT.** The Security Deposit shall be returned to the Joey within 21 days after the end of the Term less any itemized deductions. The Joey is responsible for providing Host their forwarding address."
  },
  {
    "t": "p",
    "text": "**VIII. PRORATION PERIOD.** The Joey will move in: (select one)"
  },
  {
    "t": "p",
    "text": "[[move_in_mode=start]] On the Start Date: The Joey will move-in and take possession of the Premises at the start of the Term."
  },
  {
    "t": "p",
    "text": "[[move_in_mode=early]] Before the Start Date: The Joey will move-in and take possession of the Premises on the following date of {{early_move_in_date?move_in_mode=early}}. Joey agrees to pay {{early_move_in_cents?move_in_mode=early}} to move in on this earlier date."
  },
  {
    "t": "p",
    "text": "**IX. HOUSE RULES.** The Joey agrees to the following house rules: (check and complete below)"
  },
  {
    "t": "p",
    "text": "[[rule_smoking]] Smoking/Alcohol/Drugs. {{rule_smoking_detail?rule_smoking}}"
  },
  {
    "t": "p",
    "text": "[[rule_parking]] Parking. {{rule_parking_detail?rule_parking}}"
  },
  {
    "t": "p",
    "text": "[[rule_guests]] Overnight Guests. {{rule_guests_detail?rule_guests}}"
  },
  {
    "t": "p",
    "text": "[[rule_noise]] Noise / Quiet Hours. {{rule_noise_detail?rule_noise}}"
  },
  {
    "t": "p",
    "text": "[[rule_pets]] Pets. {{rule_pets_detail?rule_pets}}"
  },
  {
    "t": "p",
    "text": "[[rule_other]] Other. {{rule_other_detail?rule_other}}"
  },
  {
    "t": "p",
    "text": "**X. FIRST (1ST) MONTH’S RENT.** The Joey’s payment of first (1st) month's rent shall be upon the: (select one)"
  },
  {
    "t": "p",
    "text": "[[first_rent=execution]] Execution of this Agreement."
  },
  {
    "t": "p",
    "text": "[[first_rent=term_start]] First (1st) day of the Term."
  },
  {
    "t": "p",
    "text": "**XI. CLEANING.** The Joey agrees to clean the {{cleaning_areas}} areas and will clean: (select one)"
  },
  {
    "t": "p",
    "text": "[[cleaning_mode=own]] On their own: There shall be no specific schedule or mandatory hours to clean."
  },
  {
    "t": "p",
    "text": "[[cleaning_mode=schedule]] According to the following cleaning schedule: {{cleaning_schedule?cleaning_mode=schedule}}"
  },
  {
    "t": "p",
    "text": "**XII. UTILITIES & SERVICES.** The Joey agrees to the following utilities and services and payment obligations: (select applicable and complete below)"
  },
  {
    "t": "p",
    "text": "[[util_gas]] **Gas / Oil / Propane.**"
  },
  {
    "t": "p",
    "text": "[[util_gas_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_gas_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_gas_mode=custom]] {{util_gas_custom?util_gas_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_water]] **Water / Sewer.**"
  },
  {
    "t": "p",
    "text": "[[util_water_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_water_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_water_mode=custom]] {{util_water_custom?util_water_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_electric]] **Electricity.**"
  },
  {
    "t": "p",
    "text": "[[util_electric_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_electric_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_electric_mode=custom]] {{util_electric_custom?util_electric_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_trash]] **Garbage **/ **Trash Removal.**"
  },
  {
    "t": "p",
    "text": "[[util_trash_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_trash_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_trash_mode=custom]] {{util_trash_custom?util_trash_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_cable]] **Cable TV.**"
  },
  {
    "t": "p",
    "text": "[[util_cable_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_cable_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_cable_mode=custom]] {{util_cable_custom?util_cable_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_internet]] **Internet.**"
  },
  {
    "t": "p",
    "text": "[[util_internet_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_internet_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_internet_mode=custom]] {{util_internet_custom?util_internet_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_other]] **Other.** {{util_other_name?util_other}}."
  },
  {
    "t": "p",
    "text": "[[util_other_mode=shared]] Shared equally",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_other_mode=included]] Included in rent",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "[[util_other_mode=custom]] {{util_other_custom?util_other_mode=custom}}",
    "lvl": 1
  },
  {
    "t": "p",
    "text": "**XIII. HOUSEHOLD SUPPLIES.** Household supplies may include such items as paper towels, toilet paper, cleaning fluids, dish detergent, foil, plastic trash bags, scrub brushes, and any other goods needed for the Premises which will be shared by the Joey."
  },
  {
    "t": "p",
    "text": "[[supplies_mode=host]] Household supplies will be the responsibility of Host to purchase and restock."
  },
  {
    "t": "p",
    "text": "[[supplies_mode=ledger]] A single ledger (with item description, cost, and date of purchase) will be kept listing all household supplies purchased by the Joey and deducted from Rent in the month following purchase."
  },
  {
    "t": "p",
    "text": "[[supplies_mode=other]] Other: {{supplies_other?supplies_mode=other}}."
  },
  {
    "t": "p",
    "text": "**XIV. SEVERABILITY. **If any provision of this Agreement or the application thereof shall, for any reason and to any extent, be invalid or unenforceable, neither the remainder of this Agreement nor the application of the provision to other persons, entities, or circumstances shall be affected thereby, but instead shall be enforced to the maximum extent permitted by law."
  },
  {
    "t": "p",
    "text": "**XV. GOVERNING LAW.** This Agreement shall be governed under the laws in the state of California, including those applicable to employment-related housing licenses.."
  },
  {
    "t": "p",
    "text": "**XVI. LODGER RELATIONSHIP. **If Host resides in the same dwelling unit as Joey, the Parties acknowledge this arrangement also qualifies as a “lodger” relationship under California Civil Code §1946.5, providing simplified removal rights upon notice."
  },
  {
    "t": "p",
    "text": "**XVII. ADDITIONAL TERMS AND CONDITIONS.**"
  },
  {
    "t": "box",
    "field": "additional_terms"
  },
  {
    "t": "p",
    "text": "**XVII. ENTIRE AGREEMENT.** This Agreement contains all the terms agreed to by the Parties and may be modified or amended only by written agreement signed by all the Parties. This Agreement replaces all previous discussions, understandings, and oral agreements. The Parties agree to the terms and conditions and shall be bound until the end of the Term."
  },
  {
    "t": "signatures",
    "parties": [
      "joey",
      "host"
    ]
  },
  {
    "t": "break"
  },
  {
    "t": "title",
    "text": "AB 1482 Just Cause and Rent Limit Exemption Addendum"
  },
  {
    "t": "sub",
    "text": "California Civil Code § 1946.2 & § 1947.12"
  },
  {
    "t": "p",
    "text": "The terms of this Addendum are intended by the parties to be added to and incorporated into the Housing License Agreement between Joey(s) and Host that currently governs the tenancy of Joey in the Premises. Host is providing written notice as required by California Law, Civil Code 1946.2 and 1947.12 with regards to just cause and rent limits."
  },
  {
    "t": "p",
    "text": "“This property is not subject to the rent limits imposed by Section 1947.12 of the Civil Code and is not subject to the just cause requirements of Section 1946.2 of the Civil Code. This property meets the requirements of Sections 1947.12 (d)(6) and 1946.2 (e)(5) of the Civil Code and the owner is not any of the following: (1) a real estate investment trust, as defined by Section 856 of the Internal Revenue Code; (2) a corporation; or (3) a limited liability company in which at least one member is a corporation.”"
  },
  {
    "t": "p",
    "text": "By signing below, Joey acknowledges and confirms that they have received, reviewed and understands this Addendum. This Addendum may be executed in counterparts and facsimile copies of same shall be admissible for all purposes and shall be deemed an original."
  },
  {
    "t": "signatures",
    "parties": [
      "joey",
      "host"
    ],
    "addendum": true
  },
  {
    "t": "p",
    "text": "**ADDITIONAL DISCLOSURES**"
  },
  {
    "t": "p",
    "text": "DEMOLITION. As per Cal. Civil Code § 1940.6, Host must give written notice prior to the signature of the housing license agreement if they have applied for a permit to demolish the premises.",
    "n": "1)"
  },
  {
    "t": "p",
    "text": "ORDNANCE LOCATIONS. In order to satisfy Cal. Civil Code § 1940.17(b), if there are any former state or federal ordinance locations in the neighborhood, Joey must be notified.",
    "n": "2)"
  },
  {
    "t": "p",
    "text": "PEST CONTROL. If Host has been periodically hiring a pest control company, then Tenants should be given a notice from that company in order to comply with Cal. Civil Code § 1940.8c.",
    "n": "3)"
  },
  {
    "t": "p",
    "text": "SHARED UTILITIES. Host must inform the Joey if there is a shared gas or electricity meter and explain how costs will be shared between tenants as per Cal. Civil Code § 1940.9.",
    "n": "4)"
  },
  {
    "t": "p",
    "text": "METHAMPHETAMINE CONTAMINATION. In accordance with Cal. Civil Code § 25400.28(b), written notice must be provided to prospective tenants if the rental property has been contaminated with methamphetamine and if the property is subject to remediation. Additionally, a copy of the remediation order must be given to Joey, and Joey must state in writing that they have received a copy of this order.",
    "n": "5)"
  },
  {
    "t": "p",
    "text": "BEDBUG DISCLOSURE. Hosts are required to provide written notice to the Joey providing specified information about bedbugs. Cal. Civil Code §1954.603):",
    "n": "6)"
  },
  {
    "t": "p",
    "text": "MOLD. If Host knows of any mold issues, they must disclose the health risks in writing to Joey. Health & Safety Code §26147.",
    "n": "7)"
  },
  {
    "t": "p",
    "text": "FLOOD HAZARD. If the unit is in a flood zone, Host must provide Joey a flood risk disclosure. Cal. Civil Code §8589.45.",
    "n": "8)"
  },
  {
    "t": "p",
    "text": "DEMOLITION PERMIT. If Host has applied for a demolition permit, they must inform the Joey before lease signing. Civil Code §1940.6.",
    "n": "9)"
  },
  {
    "t": "p",
    "text": "MEGAN’S LAW (Sex Offender Database). Rental agreements must notify tenants about their right to check the Megan’s Law database for registered sex offenders in the area. Civil Code §2079.10(a): This specific language must be included in the agreement:",
    "n": "10)"
  },
  {
    "t": "p",
    "text": "Notice: Pursuant to Section 290.46 of the Penal Code, information about specified registered sex offenders is made available to the public via an Internet website maintained by the Department of Justice at www.meganslaw.ca.gov.",
    "n": "a)",
    "lvl": 1
  }
];
