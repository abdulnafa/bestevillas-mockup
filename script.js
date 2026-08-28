const body = document.body;
const header = document.querySelector("#site-header");
const menuToggle = document.querySelector(".menu-toggle");
const menuIconUse = menuToggle?.querySelector("use");
const mobileNavLinks = document.querySelectorAll(".mobile-nav a");
const bookingForm = document.querySelector("#booking-form");
const locationSelect = document.querySelector("#location");
const checkInInput = document.querySelector("#check-in");
const checkOutInput = document.querySelector("#check-out");
const guestSelect = document.querySelector("#guests");
const searchFeedback = document.querySelector("#search-feedback");
const villaCards = [...document.querySelectorAll(".villa-card")];
const modal = document.querySelector("#villa-modal");

const villaDetails = {
  "prospect-three": {
    title: "Prospect — 3 Bedroom",
    location: "Prospect · Platinum West Coast",
    image: "assets/images/prospect-3-bedroom.jpg",
    alt: "Prospect three-bedroom villa exterior",
    description:
      "A spacious three-bedroom, two-bathroom base near West Coast beaches, Bridgetown and the University of the West Indies. Fully equipped for relaxed family stays.",
    meta: ["3 bedrooms", "2 bathrooms", "Pool access", "Equipped kitchen", "Wi-Fi"],
  },
  providence: {
    title: "Providence Terrace — 2 Bedroom",
    location: "Providence · South Coast",
    image: "assets/images/providence-terrace.jpg",
    alt: "Providence Terrace villa exterior",
    description:
      "A comfortable two-bedroom retreat in a quiet neighbourhood near Miami Beach, Oistins, St. Lawrence Gap and Barbados Golf Club.",
    meta: ["2 bedrooms", "1 bathroom", "Swimming pool", "Private balcony", "Wi-Fi"],
  },
  "prospect-two": {
    title: "Prospect — 2 Bedroom",
    location: "Prospect · Platinum West Coast",
    image: "assets/images/prospect-2-bedroom.jpg",
    alt: "Prospect two-bedroom villa exterior",
    description:
      "An easygoing two-bedroom, one-and-a-half-bathroom stay with the everyday comforts families need and a convenient West Coast location.",
    meta: ["2 bedrooms", "1.5 bathrooms", "Pool access", "Laundry", "Wi-Fi"],
  },
  "st-silas": {
    title: "St. Silas — 3 Bedroom",
    location: "St. Silas Heights · St. James",
    image: "assets/images/st-silas.jpg",
    alt: "St. Silas three-bedroom villa exterior",
    description:
      "A roomy three-bedroom, two-and-a-half-bathroom vacation rental close to Apes Hill, Royal Westmoreland, Warrens and West Coast beaches.",
    meta: ["3 bedrooms", "2.5 bathrooms", "Private balcony", "Garden", "Wi-Fi"],
  },
};

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));
}

function setDateLimits() {
  const today = toDateInputValue(new Date());
  checkInInput.min = today;
  checkOutInput.min = today;

  checkInInput.addEventListener("change", () => {
    if (!checkInInput.value) return;
    const nextDay = addDays(checkInInput.value, 1);
    checkOutInput.min = nextDay;
    if (!checkOutInput.value || checkOutInput.value <= checkInInput.value) {
      checkOutInput.value = nextDay;
    }
  });
}

function setMenuState(open) {
  header.classList.toggle("menu-active", open);
  body.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menuIconUse.setAttribute("href", open ? "#icon-close" : "#icon-menu");
}

menuToggle?.addEventListener("click", () => {
  setMenuState(!header.classList.contains("menu-active"));
});

mobileNavLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

window.addEventListener(
  "scroll",
  () => {
    header.classList.toggle("scrolled", window.scrollY > 30);
  },
  { passive: true },
);

function filterVillas(location) {
  let count = 0;
  villaCards.forEach((card) => {
    const matches = location === "all" || card.dataset.location === location;
    card.classList.toggle("filtered-out", !matches);
    if (matches) count += 1;
  });
  return count;
}

bookingForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!bookingForm.reportValidity()) return;

  if (checkOutInput.value <= checkInInput.value) {
    searchFeedback.className = "search-feedback container error";
    searchFeedback.textContent = "Please select a check-out date after your check-in date.";
    checkOutInput.focus();
    return;
  }

  const selectedLocation = locationSelect.value;
  const count = filterVillas(selectedLocation);
  const locationLabel = locationSelect.options[locationSelect.selectedIndex].text;
  const guests = guestSelect.options[guestSelect.selectedIndex].text;

  searchFeedback.className = "search-feedback container";
  searchFeedback.textContent = `${count} villa${count === 1 ? "" : "s"} matched for ${guests}, ${formatDate(
    checkInInput.value,
  )}–${formatDate(checkOutInput.value)}. Live rates and availability will connect to the booking engine.`;

  document.querySelector("#villas").scrollIntoView({ behavior: "smooth" });
  document.querySelector("#villas .section-heading > p").textContent =
    selectedLocation === "all"
      ? "Four comfortable ways to experience the island, each with its own setting and character."
      : `Showing stays on the ${locationLabel}. Adjust your search above to explore every location.`;
});

document.querySelectorAll(".location-filter").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    locationSelect.value = filter;
    const count = filterVillas(filter);
    const label = filter === "west" ? "West Coast" : "South Coast";
    searchFeedback.className = "search-feedback container";
    searchFeedback.textContent = `${count} ${label} villa${count === 1 ? "" : "s"} shown below.`;
    document.querySelector("#villas").scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll(".favorite-button").forEach((button) => {
  button.addEventListener("click", () => {
    const isActive = button.classList.toggle("active");
    const label = button.getAttribute("aria-label").replace(/^Save |^Remove /, "");
    button.setAttribute("aria-label", `${isActive ? "Remove" : "Save"} ${label}`);
    button.title = isActive ? "Saved to your villa shortlist" : "Save to shortlist";
  });
});

function openVillaModal(key) {
  const villa = villaDetails[key];
  if (!villa || !modal) return;

  document.querySelector("#modal-image").src = villa.image;
  document.querySelector("#modal-image").alt = villa.alt;
  document.querySelector("#modal-location").textContent = villa.location;
  document.querySelector("#modal-title").textContent = villa.title;
  document.querySelector("#modal-description").textContent = villa.description;
  document.querySelector("#modal-meta").innerHTML = villa.meta
    .map((item) => `<span>${item}</span>`)
    .join("");

  if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "");
  }
  body.classList.add("modal-open");
}

function closeVillaModal() {
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
  body.classList.remove("modal-open");
}

document.querySelectorAll(".quick-view").forEach((button) => {
  button.addEventListener("click", () => {
    openVillaModal(button.closest(".villa-card").dataset.villa);
  });
});

document.querySelector(".modal-close")?.addEventListener("click", closeVillaModal);
document.querySelector("#modal-book")?.addEventListener("click", closeVillaModal);

modal?.addEventListener("click", (event) => {
  const rect = modal.getBoundingClientRect();
  const clickedBackdrop =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;
  if (clickedBackdrop) closeVillaModal();
});

modal?.addEventListener("close", () => body.classList.remove("modal-open"));

document.querySelectorAll(".faq-item button").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    const willOpen = !item.classList.contains("open");

    document.querySelectorAll(".faq-item").forEach((faq) => {
      faq.classList.remove("open");
      faq.querySelector("button").setAttribute("aria-expanded", "false");
    });

    if (willOpen) {
      item.classList.add("open");
      button.setAttribute("aria-expanded", "true");
    }
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.12 },
);

document.querySelectorAll(".reveal").forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  observer.observe(element);
});

document.querySelector("#current-year").textContent = new Date().getFullYear();
setDateLimits();
