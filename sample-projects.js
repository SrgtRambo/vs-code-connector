// Fictional Discovery examples for quickly exercising Forge's offline workflow.
(function () {
  "use strict";
  window.ForgeSampleProjects = [
    {
      id: "sample-juniper-market",
      business: "Juniper Market",
      industry: "Retail",
      size: "2–10 employees",
      employees: "6",
      activities: "Sell specialty groceries and manage weekly supplier deliveries.",
      tools: "Paper stock counts and spreadsheets",
      problem: "Popular products are discovered to be out of stock after weekly stock counts.",
      workflow: "Receive supplier deliveries, count products, and review low-stock items before placing orders.",
      goal: "Keep accurate product quantities and identify what needs replenishment.",
      features: "Product catalog, supplier details, quantity tracking, reorder thresholds",
      users: "Store owner, stock lead",
      success: "Fewer unexpected stockouts",
      constraints: "Must be simple to use on a shared store computer."
    },
    {
      id: "sample-summit-plumbing",
      business: "Summit Plumbing",
      industry: "Home Services",
      size: "11–50 employees",
      employees: "14",
      activities: "Handle residential plumbing calls, estimates, and service visits.",
      tools: "Phone, email, and a shared spreadsheet",
      problem: "Customer requests and promised callbacks are easy to lose during busy days.",
      workflow: "Record an inquiry, assign a dispatcher or technician, schedule a follow-up, and update the outcome.",
      goal: "Give the team one place to track customer requests and the next action.",
      features: "Customer pipeline, request notes, owner assignment, follow-up dates",
      users: "Owner, dispatcher, technician",
      success: "Every new request has an owner and a next step",
      constraints: "Use fictional data for this prototype; no real customer data."
    },
    {
      id: "sample-cedar-grove-landscaping",
      business: "Cedar Grove Landscaping",
      industry: "Home Services",
      size: "11–50 employees",
      employees: "18",
      activities: "Coordinate recurring yard-care visits and seasonal landscaping jobs.",
      tools: "Paper work orders and text messages",
      problem: "Crew assignments and job completion updates are scattered across messages.",
      workflow: "Create a work order, assign it to a crew supervisor, set a due date, and mark the job complete.",
      goal: "Help the office see which jobs are new, underway, waiting, or done.",
      features: "Work orders, crew ownership, due dates, status tracking",
      users: "Office coordinator, crew lead",
      success: "The office can see the status of every active job",
      constraints: "The starter app must work locally without external services."
    },
    {
      id: "sample-pinecone-catering",
      business: "Pinecone Catering",
      industry: "Food and Hospitality",
      size: "2–10 employees",
      employees: "8",
      activities: "Plan catered events, coordinate menus, and prepare deliveries.",
      tools: "Email, calendar, and event worksheets",
      problem: "Event inquiries, planning notes, and follow-up dates live in separate places.",
      workflow: "Capture an event inquiry, record the event date and notes, follow up with the organizer, and track its stage.",
      goal: "Track catering inquiries from first contact through a confirmed event.",
      features: "Event inquiry pipeline, organizer contact, follow-up date, planning notes",
      users: "Owner, event coordinator",
      success: "Upcoming inquiries have a visible follow-up owner",
      constraints: "The first version is a local prototype, not a production booking or payment system."
    }
  ];
})();
