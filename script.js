const body = document.body;
const header = document.querySelector("#site-header");
const menuToggle = document.querySelector(".menu-toggle");
const menuIconUse = menuToggle?.querySelector("use");
const mobileNav = document.querySelector(".mobile-nav");

const villaData = {
  "prospect-three": {
    title: "Prospect — 3 Bedroom",
    location: "Prospect, St. James · West Coast",
    shortLocation: "Prospect, St. James",
    addressLocality: "Prospect",
    addressRegion: "St. James",
    bedrooms: 3,
    bathrooms: 2,
    seoDescription:
      "Explore the three-bedroom Best E Villas vacation rental in Prospect, St. James, with two bathrooms, shared pool access and fibre Wi-Fi.",
    description:
      "A spacious three-bedroom base near West Coast beaches, Bridgetown and the University of the West Indies, with the everyday comforts families need for an easy Barbados stay.",
    facts: ["3 bedrooms", "2 bathrooms", "Shared pool", "Fibre Wi-Fi"],
    images: [
      { src: "assets/images/properties/prospect-three/exterior.jpg", alt: "Guests relaxing beside the shared pool at Prospect", width: 1440, height: 1440 },
      { src: "assets/images/properties/prospect-three/living.jpg", alt: "Living room in the three-bedroom Prospect villa", width: 2560, height: 1707 },
      { src: "assets/images/properties/prospect-three/bedroom.jpg", alt: "Bedroom in the three-bedroom Prospect villa", width: 2560, height: 1707 },
    ],
    bookingUrl: "https://direct-book.com/properties/bestevillasprospctdirect",
  },
  "prospect-two": {
    title: "Prospect — 2 Bedroom",
    location: "Prospect, St. James · West Coast",
    shortLocation: "Prospect, St. James",
    addressLocality: "Prospect",
    addressRegion: "St. James",
    bedrooms: 2,
    bathrooms: 1.5,
    seoDescription:
      "Explore the two-bedroom Best E Villas vacation rental in Prospect, St. James, with 1.5 bathrooms, shared pool access and fibre Wi-Fi.",
    description:
      "A comfortable two-bedroom apartment with the space and practical amenities needed for relaxed family time on Barbados’ West Coast.",
    facts: ["2 bedrooms", "1.5 bathrooms", "Shared pool", "Fibre Wi-Fi"],
    images: [
      { src: "assets/images/properties/prospect-two/exterior.jpg", alt: "Exterior of the two-bedroom Prospect villa", width: 2560, height: 1707 },
      { src: "assets/images/properties/prospect-two/living.jpg", alt: "Living room in the two-bedroom Prospect villa", width: 2560, height: 1707 },
      { src: "assets/images/properties/prospect-two/bedroom.jpg", alt: "Bedroom in the two-bedroom Prospect villa", width: 2560, height: 1707 },
    ],
    bookingUrl: "https://direct-book.com/properties/bestevillasprospctdirect",
  },
  providence: {
    title: "Providence Terrace — 2 Bedroom",
    location: "Providence, Christ Church · South Coast",
    shortLocation: "Providence, Christ Church",
    addressLocality: "Providence",
    addressRegion: "Christ Church",
    bedrooms: 2,
    bathrooms: 1,
    seoDescription:
      "Explore the two-bedroom Best E Villas vacation rental in Providence, Christ Church, with one bathroom, shared pool access and Wi-Fi.",
    description:
      "A peaceful two-bedroom South Coast base near Miami Beach, Oistins, St. Lawrence Gap and Barbados Golf Club.",
    facts: ["2 bedrooms", "1 bathroom", "Shared pool", "Wi-Fi"],
    images: [
      { src: "assets/images/properties/providence/exterior.jpg", alt: "Exterior of Providence Terrace in Christ Church", width: 1024, height: 683 },
      { src: "assets/images/properties/providence/living.jpg", alt: "Living room at Providence Terrace", width: 1024, height: 683 },
      { src: "assets/images/properties/providence/bedroom.jpg", alt: "Bedroom at Providence Terrace", width: 1024, height: 683 },
    ],
    bookingUrl: "https://direct-book.com/properties/bestevillaprovidencedirect",
  },
  "st-silas": {
    title: "St. Silas — 3 Bedroom",
    location: "St. Silas Heights, St. James · West Coast",
    shortLocation: "St. Silas Heights, St. James",
    addressLocality: "St. Silas Heights",
    addressRegion: "St. James",
    bedrooms: 3,
    bathrooms: 2.5,
    seoDescription:
      "Explore the three-bedroom Best E Villas vacation rental in St. Silas Heights, St. James, with 2.5 bathrooms, pool access and Wi-Fi.",
    description:
      "A roomy three-bedroom retreat close to Apes Hill, Royal Westmoreland, Warrens and the beaches of Barbados’ West Coast.",
    facts: ["3 bedrooms", "2.5 bathrooms", "Pool access", "Wi-Fi"],
    images: [
      { src: "assets/images/properties/st-silas/exterior.jpg", alt: "Exterior of the three-bedroom St. Silas villa", width: 2560, height: 1440 },
      { src: "assets/images/properties/st-silas/living.jpg", alt: "Living room in the three-bedroom St. Silas villa", width: 2560, height: 1656 },
      { src: "assets/images/properties/st-silas/bedroom.jpg", alt: "Bedroom in the three-bedroom St. Silas villa", width: 2560, height: 1707 },
    ],
    bookingUrl: "https://direct-book.com/properties/bestevillasstsilasstjames",
  },
};

function setMenuState(open) {
  if (!header || !menuToggle) return;
  const nextOpen = Boolean(open);
  header.classList.toggle("menu-active", nextOpen);
  body.classList.toggle("menu-open", nextOpen);
  menuToggle.setAttribute("aria-expanded", String(nextOpen));
  menuToggle.setAttribute("aria-label", nextOpen ? "Close menu" : "Open menu");
  mobileNav?.setAttribute("aria-hidden", String(!nextOpen));
  if (mobileNav && "inert" in mobileNav) mobileNav.inert = !nextOpen;
  menuIconUse?.setAttribute("href", nextOpen ? "#icon-close" : "#icon-menu");
  const menuLabel = menuToggle.querySelector(".menu-toggle-label");
  if (menuLabel) menuLabel.textContent = nextOpen ? "Close" : "Menu";
}

setMenuState(false);

menuToggle?.addEventListener("click", () => {
  setMenuState(!header?.classList.contains("menu-active"));
});

document.querySelectorAll(".mobile-nav a").forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuState(false);
});

window.addEventListener("resize", () => {
  if (menuToggle && getComputedStyle(menuToggle).display === "none") setMenuState(false);
});

function initHeroCarousel() {
  const carousel = document.querySelector(".hero-carousel");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll(".hero-slide")];
  const previous = carousel.querySelector(".carousel-previous");
  const next = carousel.querySelector(".carousel-next");
  const count = carousel.querySelector(".carousel-count strong");
  if (!slides.length || !previous || !next || !count) return;

  let activeIndex = 0;
  let navigationRequest = 0;

  async function loadPreview(slide) {
    const image = slide?.querySelector("img");
    if (!image) return false;
    if (image.complete && image.naturalWidth > 0) return true;
    const preview = new Image();
    preview.decoding = "async";
    const loaded = await new Promise((resolveLoad) => {
      const timeout = setTimeout(() => resolveLoad(false), 8000);
      preview.addEventListener("load", () => { clearTimeout(timeout); resolveLoad(true); }, { once: true });
      preview.addEventListener("error", () => { clearTimeout(timeout); resolveLoad(false); }, { once: true });
      preview.src = image.src;
      if (preview.complete && preview.naturalWidth > 0) {
        clearTimeout(timeout);
        resolveLoad(true);
      }
    });
    if (!loaded) return false;
    image.loading = "eager";
    image.src = preview.src;
    return true;
  }

  function upgradeSlide(slide) {
    const image = slide?.querySelector("img[data-responsive-src]");
    if (!image || image.dataset.upgradePending === "true") return;
    const source = image.dataset.responsiveSrc;
    const sourceSet = image.dataset.responsiveSrcset;
    const preload = new Image();
    let settled = false;
    image.dataset.upgradePending = "true";
    preload.decoding = "async";
    preload.sizes = image.sizes || "100vw";

    const applyUpgrade = async () => {
      if (settled) return;
      settled = true;
      try { await preload.decode(); } catch {}
      image.removeAttribute("srcset");
      image.src = preload.currentSrc || source;
      try { await image.decode(); } catch {}
      delete image.dataset.responsiveSrc;
      delete image.dataset.responsiveSrcset;
      delete image.dataset.upgradePending;
    };
    const cancelUpgrade = () => {
      if (settled) return;
      settled = true;
      delete image.dataset.upgradePending;
    };
    preload.addEventListener("load", () => void applyUpgrade(), { once: true });
    preload.addEventListener("error", cancelUpgrade, { once: true });
    if (sourceSet) preload.srcset = sourceSet;
    preload.src = source;
    if (preload.complete && preload.naturalWidth > 0) void applyUpgrade();
  }

  async function showSlide(nextIndex) {
    const targetIndex = (nextIndex + slides.length) % slides.length;
    const currentRequest = ++navigationRequest;
    if (!(await loadPreview(slides[targetIndex])) || currentRequest !== navigationRequest) return;
    activeIndex = targetIndex;
    slides.forEach((slide, index) => {
      const active = index === activeIndex;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    upgradeSlide(slides[activeIndex]);
    count.textContent = String(activeIndex + 1).padStart(2, "0");
  }

  previous.addEventListener("click", () => void showSlide(activeIndex - 1));
  next.addEventListener("click", () => void showSlide(activeIndex + 1));
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") void showSlide(activeIndex - 1);
    if (event.key === "ArrowRight") void showSlide(activeIndex + 1);
  });
}

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

function initDateForms() {
  const today = toDateInputValue(new Date());

  document.querySelectorAll("form").forEach((form) => {
    const checkIn = form.querySelector('input[name="check-in"], input[data-check-in]');
    const checkOut = form.querySelector('input[name="check-out"], input[data-check-out]');
    if (!checkIn || !checkOut) return;

    checkIn.min = today;
    checkOut.min = today;

    checkIn.addEventListener("change", () => {
      if (!checkIn.value) return;
      const nextDay = addDays(checkIn.value, 1);
      checkOut.min = nextDay;
      if (!checkOut.value || checkOut.value <= checkIn.value) checkOut.value = nextDay;
    });

    form.addEventListener("submit", (event) => {
      if (checkIn.value && checkOut.value && checkOut.value <= checkIn.value) {
        event.preventDefault();
        checkOut.setCustomValidity("Choose a check-out date after your check-in date.");
        checkOut.reportValidity();
        checkOut.focus();
      } else {
        checkOut.setCustomValidity("");
      }
    });
  });
}

function initVillaFilters() {
  const form = document.querySelector("#villa-filter-form");
  const cards = [...document.querySelectorAll("[data-villa-card]")];
  const resultCount = document.querySelector("#villa-result-count");
  if (!form || !cards.length || !resultCount) return;

  const location = form.querySelector('[name="location"]');
  const bedrooms = form.querySelector('[name="bedrooms"]');
  const params = new URLSearchParams(window.location.search);

  if (params.has("location")) location.value = params.get("location");
  if (params.has("bedrooms")) bedrooms.value = params.get("bedrooms");

  function applyFilters(updateUrl = true) {
    let visible = 0;
    cards.forEach((card) => {
      const locationMatch = location.value === "all" || card.dataset.location === location.value;
      const bedroomMatch = bedrooms.value === "all" || Number(card.dataset.bedrooms) >= Number(bedrooms.value);
      const matches = locationMatch && bedroomMatch;
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    resultCount.textContent = `${visible} villa${visible === 1 ? "" : "s"}`;
    document.querySelector("#villa-empty")?.toggleAttribute("hidden", visible !== 0);

    if (updateUrl) {
      const nextParams = new URLSearchParams();
      if (location.value !== "all") nextParams.set("location", location.value);
      if (bedrooms.value !== "all") nextParams.set("bedrooms", bedrooms.value);
      const query = nextParams.toString();
      history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilters();
  });
  form.addEventListener("reset", () => window.setTimeout(() => applyFilters(), 0));
  applyFilters(false);
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setMetaContent(selector, value) {
  document.querySelector(selector)?.setAttribute("content", value);
}

function initVillaTemplate() {
  const page = document.querySelector("[data-villa-template]");
  if (!page) return;

  const params = new URLSearchParams(window.location.search);
  const requestedKey = params.get("villa") || page.dataset.villaTemplate || "prospect-three";
  const key = Object.prototype.hasOwnProperty.call(villaData, requestedKey) ? requestedKey : "prospect-three";
  const villa = villaData[key];
  const canonicalUrl = `https://bestevillas.com/villa.html?villa=${encodeURIComponent(key)}`;
  const primaryImageUrl = new URL(villa.images[0].src, "https://bestevillas.com/").href;

  setText("[data-villa-title]", villa.title);
  setText("[data-villa-location]", villa.location);
  setText("[data-villa-short-location]", villa.shortLocation);
  setText("[data-villa-description]", villa.description);
  document.title = `${villa.title} | Best E Villas`;

  setMetaContent('meta[name="description"]', villa.seoDescription);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
  setMetaContent('meta[property="og:title"]', `${villa.title} | Best E Villas`);
  setMetaContent('meta[property="og:description"]', villa.seoDescription);
  setMetaContent('meta[property="og:url"]', canonicalUrl);
  setMetaContent('meta[property="og:image"]', primaryImageUrl);
  setMetaContent('meta[property="og:image:alt"]', villa.images[0].alt);
  setMetaContent('meta[property="og:image:width"]', String(villa.images[0].width));
  setMetaContent('meta[property="og:image:height"]', String(villa.images[0].height));
  setMetaContent('meta[name="twitter:title"]', `${villa.title} | Best E Villas`);
  setMetaContent('meta[name="twitter:description"]', villa.seoDescription);
  setMetaContent('meta[name="twitter:image"]', primaryImageUrl);
  setMetaContent('meta[name="twitter:image:alt"]', villa.images[0].alt);

  const structuredData = document.querySelector("#villa-structured-data");
  if (structuredData) {
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VacationRental",
      "@id": `${canonicalUrl}#villa`,
      url: canonicalUrl,
      name: villa.title,
      description: villa.description,
      image: villa.images.map((image) => new URL(image.src, "https://bestevillas.com/").href),
      address: {
        "@type": "PostalAddress",
        addressLocality: villa.addressLocality,
        addressRegion: villa.addressRegion,
        addressCountry: "BB",
      },
      numberOfBedrooms: villa.bedrooms,
      numberOfBathroomsTotal: villa.bathrooms,
      amenityFeature: villa.facts.slice(2).map((fact) => ({
        "@type": "LocationFeatureSpecification",
        name: fact,
        value: true,
      })),
      provider: { "@id": "https://bestevillas.com/#business" },
      potentialAction: { "@type": "ReserveAction", target: villa.bookingUrl },
    });
  }

  const mainImage = document.querySelector("#villa-main-image");
  if (mainImage) {
    mainImage.src = villa.images[0].src;
    mainImage.alt = villa.images[0].alt;
    mainImage.width = villa.images[0].width;
    mainImage.height = villa.images[0].height;
  }

  const galleryImages = [...document.querySelectorAll("[data-gallery-image]")];
  galleryImages.forEach((image, index) => {
    const source = villa.images[index] || villa.images[0];
    image.src = source.src;
    image.alt = source.alt;
    image.width = source.width;
    image.height = source.height;
  });

  const factList = document.querySelector("#villa-facts");
  if (factList) {
    factList.replaceChildren();
    villa.facts.forEach((fact) => {
      const item = document.createElement("li");
      item.textContent = fact;
      factList.append(item);
    });
  }

  document.querySelectorAll("[data-booking-link]").forEach((link) => {
    link.href = villa.bookingUrl;
  });

  const externalForm = document.querySelector("#external-booking-form");
  if (externalForm) externalForm.action = villa.bookingUrl;

  document.querySelectorAll("[data-gallery-thumb]").forEach((button) => {
    const imageIndex = Number(button.dataset.galleryIndex || 0);
    const source = villa.images[imageIndex] || villa.images[0];
    const thumbnail = button.querySelector("img");
    if (thumbnail) {
      thumbnail.src = source.src;
      thumbnail.alt = source.alt;
      thumbnail.width = source.width;
      thumbnail.height = source.height;
    }
    button.setAttribute("aria-pressed", String(imageIndex === 0));
    button.addEventListener("click", () => {
      if (!mainImage) return;
      mainImage.src = source.src;
      mainImage.alt = source.alt;
      mainImage.width = source.width;
      mainImage.height = source.height;
      document.querySelectorAll("[data-gallery-thumb]").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
    });
  });
}

function initFaqs() {
  document.querySelectorAll(".faq-item button").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      if (!item) return;
      const willOpen = !item.classList.contains("open");
      item.parentElement.querySelectorAll(".faq-item").forEach((faq) => {
        faq.classList.remove("open");
        faq.querySelector("button")?.setAttribute("aria-expanded", "false");
      });
      if (willOpen) {
        item.classList.add("open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });
}

function initReveals() {
  const elements = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08 },
  );
  elements.forEach((element) => observer.observe(element));
}

document.querySelectorAll("#current-year, [data-current-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

initHeroCarousel();
initDateForms();
initVillaFilters();
initVillaTemplate();
initFaqs();
initReveals();
