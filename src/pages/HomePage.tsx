import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Wrench,
  MapPin,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  Star,
  ShieldCheck,
  Clock,
  Store,
  ArrowRight,
  Smartphone,
  CheckCircle2,
  Scissors,
  Stethoscope,
  Home,
  Plus,
  Building2,
  Users,
  Heart
} from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Shop, ShopProduct } from '../types/database';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const { selectedLocation, setIsLocationModalOpen } = useLocationContext();
  const { addItem } = useCart();
  const { success } = useToast();
  const navigate = useNavigate();

  // Category filter state for "Discover What's Around You"
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Selected variant tracking for demo product discovery
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({
    'prod-milk': '1 L',
    'prod-sambar': '500 g',
    'prod-bread': 'Standard',
  });

  // FAQ open/close accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleVariantSelect = (productId: string, variant: string) => {
    setSelectedVariants((prev) => ({ ...prev, [productId]: variant }));
  };

  const handleQuickAdd = (id: string, name: string, price: number, shopName: string, imageUrl: string) => {
    const variant = selectedVariants[id];
    const demoShop: Shop = {
      id: 'shop-gobi-grocery-1',
      owner_id: 's2222222-0000-0000-0000-000000000003',
      shop_type_id: '0f56b1ab-c358-4638-bf0c-4b510a15482f',
      location_id: selectedLocation.id,
      name: shopName,
      tagline: 'Verified neighborhood store on Vaangly',
      address_line: 'Town Center, Kangeyam',
      phone: '+91 98765 23456',
      status: 'active',
      is_live: true,
      delivery_available: true,
      delivery_fee: 20,
      upi_id: 'greenmart@upi',
      gps_lat: 11.0048,
      gps_lng: 77.5829,
      photo_url: imageUrl,
      opening_time: '07:00',
      closing_time: '22:00',
      is_open_today: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const demoProduct: ShopProduct = {
      id,
      shop_id: demoShop.id,
      name: variant ? `${name} (${variant})` : name,
      description: null,
      price,
      unit: variant || 'item',
      is_available: true,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    };
    addItem(demoProduct, demoShop);
    success(`Added ${name} to your cart!`);
  };

  const businessCategories = [
    { id: 'all', label: 'All Businesses', emoji: '🏬' },
    { id: 'groceries', label: 'Groceries', emoji: '🥦' },
    { id: 'bakery', label: 'Food & Bakery', emoji: '🥖' },
    { id: 'fashion', label: 'Fashion', emoji: '👗' },
    { id: 'salon', label: 'Beauty & Salon', emoji: '✂️' },
    { id: 'health', label: 'Health', emoji: '🩺' },
    { id: 'home', label: 'Home Services', emoji: '🔧' },
    { id: 'electronics', label: 'Electronics', emoji: '📱' },
    { id: 'services', label: 'Local Services', emoji: '🛵' },
  ];

  const featuredShops = [
    {
      id: 'shop-1',
      name: 'Green Mart Provisions',
      category: 'Groceries',
      categoryKey: 'groceries',
      distance: '1.2 km away',
      location: selectedLocation.name,
      rating: 4.8,
      reviewsCount: 142,
      tagline: 'Farm-fresh vegetables, cold-pressed oils & pulses',
      image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
      badge: 'Fast Counter Pickup',
    },
    {
      id: 'shop-2',
      name: 'Crown Bakery & Sweets',
      category: 'Food & Bakery',
      categoryKey: 'bakery',
      distance: '0.8 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 210,
      tagline: 'Fresh wheat bread, butter cookies & evening hot snacks',
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80',
      badge: 'Fresh Daily',
    },
    {
      id: 'shop-3',
      name: 'Karpagam Silks & Tailors',
      category: 'Fashion',
      categoryKey: 'fashion',
      distance: '1.5 km away',
      location: selectedLocation.name,
      rating: 4.7,
      reviewsCount: 88,
      tagline: 'Traditional sarees, cotton shirts & expert alterations',
      image: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&auto=format&fit=crop&q=80',
      badge: 'Custom Stitching',
    },
    {
      id: 'shop-4',
      name: 'Ayush Care Clinic & Pharmacy',
      category: 'Health',
      categoryKey: 'health',
      distance: '0.5 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 164,
      tagline: 'Consultation tokens, daily prescription refills & baby care',
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&auto=format&fit=crop&q=80',
      badge: 'Verified Doctor',
    },
    {
      id: 'shop-5',
      name: 'Elite Grooming Studio & Salon',
      category: 'Beauty & Salon',
      categoryKey: 'salon',
      distance: '1.0 km away',
      location: selectedLocation.name,
      rating: 4.8,
      reviewsCount: 125,
      tagline: 'Modern haircuts, beard sculpting & skin rejuvenation',
      image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
      badge: 'Appointments Open',
    },
    {
      id: 'shop-6',
      name: 'Velan Two-Wheeler Workshop',
      category: 'Local Services',
      categoryKey: 'services',
      distance: '2.1 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 94,
      tagline: 'Oil servicing, electrical repair & periodic tune-ups',
      image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=800&auto=format&fit=crop&q=80',
      badge: 'Service Slots Available',
    },
  ];

  const filteredShops = activeCategory === 'all'
    ? featuredShops
    : featuredShops.filter((s) => s.categoryKey === activeCategory);

  const featuredProducts = [
    {
      id: 'prod-milk',
      name: 'Farm Fresh Pure Milk',
      shop: 'Green Mart Provisions',
      price: 45,
      variants: ['500 ml', '1 L'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'prod-sambar',
      name: 'Stone-Ground Sambar Powder',
      shop: 'Kaveri Organic Spices',
      price: 110,
      variants: ['250 g', '500 g'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'prod-bread',
      name: 'Artisan Whole Wheat Bread',
      shop: 'Crown Bakery & Sweets',
      price: 40,
      variants: ['Standard', 'Large'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'prod-eggs',
      name: 'Organic Country Eggs (Pack of 6)',
      shop: 'Green Mart Provisions',
      price: 65,
      variants: [],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&auto=format&fit=crop&q=80',
    },
  ];

  const servicesList = [
    {
      id: 'srv-1',
      title: 'Salon Appointment',
      business: 'Elite Grooming Studio',
      info: 'Haircut, styling & beard trim. Dedicated seat with zero waiting.',
      duration: '30 mins',
      actionUrl: '/shops?group=APPOINTMENT',
      icon: <Scissors size={24} />,
      image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'srv-2',
      title: 'Doctor Appointment',
      business: 'City Care Health Clinic',
      info: 'General physician, pediatrics & diagnostics. Direct token confirmation.',
      duration: '15 mins',
      actionUrl: '/shops?group=APPOINTMENT',
      icon: <Stethoscope size={24} />,
      image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'srv-3',
      title: 'Home Electrical & Plumbing',
      business: 'Express Home Services',
      info: 'Wiring check, pipe repair, tap leaks, and inverter maintenance.',
      duration: 'On-site visit',
      actionUrl: '/shops?group=SERVICE',
      icon: <Home size={24} />,
      image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'srv-4',
      title: 'Repair Service (Two-Wheeler)',
      business: 'Velan Two-Wheeler Workshop',
      info: 'Engine tuning, brake service, chain lube & periodic oil replacement.',
      duration: 'Same-day turnaround',
      actionUrl: '/shops?group=SERVICE',
      icon: <Wrench size={24} />,
      image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: 'srv-5',
      title: 'Beauty & Bridal Service',
      business: 'Nandhini Bridal Parlour',
      info: 'Facial, threading, bridal mehndi and hair spa sessions.',
      duration: '45 mins',
      actionUrl: '/shops?group=APPOINTMENT',
      icon: <Sparkles size={24} />,
      image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&auto=format&fit=crop&q=80',
    },
  ];

  const faqList = [
    {
      q: 'What is Vaangly?',
      a: 'Vaangly is a local commerce and services platform that connects customers with verified nearby shops, services, and appointment providers in their hometown. You can discover local businesses, pre-order groceries and daily essentials, and book service appointments with trusted community professionals.',
    },
    {
      q: 'How does Vaangly work?',
      a: 'Simply select your town to see nearby businesses. You can browse products to place order requests, book scheduled appointment slots for salons or clinics, or request home repairs. Merchants confirm your request and update you in real time when items are packed or ready.',
    },
    {
      q: 'Can I order from local shops?',
      a: 'Yes. You can browse catalogs from local grocery stores, bakeries, eateries, and pharmacies, add items to your cart, and place an order request. You can choose counter pickup to skip waiting lines or select local doorstep delivery where offered.',
    },
    {
      q: 'Can I book appointments?',
      a: 'Yes! Vaangly is not just shopping. You can book guaranteed appointment slots at neighborhood clinics, barbershops, salons, dental care centers, and diagnostic labs without waiting in long queues.',
    },
    {
      q: 'Can businesses join Vaangly?',
      a: 'Absolutely. Any verified local merchant or service provider can click "Join as a Business" or "For Businesses", submit basic shop details, storefront photos, and verification documents to start receiving orders and appointment requests.',
    },
    {
      q: 'Is Vaangly available on mobile?',
      a: 'Yes, Vaangly is a modern Progressive Web App (PWA) that installs seamlessly onto any Android or iOS device from your browser. A dedicated mobile application is also releasing soon.',
    },
    {
      q: 'How do businesses add their products?',
      a: 'Once approved, business owners receive access to the Vaangly Shopkeeper Dashboard where they can add products, set prices and units, define variants (like 500 ml vs 1 L), list services, and configure opening hours.',
    },
    {
      q: 'How are order updates provided?',
      a: 'Both customers and shopkeepers receive real-time notifications when an order is received, accepted, packed, or ready for pickup. Live status tracking keeps everyone informed without constant phone calls.',
    },
  ];

  return (
    <div className="vaangly-landing">
      {/* 1. Location Bar */}
      <section className="vaangly-location-bar">
        <div className="container vaangly-location-bar__inner">
          <button
            type="button"
            className="vaangly-location-chip"
            onClick={() => setIsLocationModalOpen(true)}
            aria-label={`Current location is ${selectedLocation.name}. Tap to change town.`}
          >
            <MapPin size={16} className="vaangly-location-icon" />
            <span className="vaangly-location-label">Browsing local businesses in:</span>
            <strong className="vaangly-location-name">
              {selectedLocation.name}, {selectedLocation.state}
            </strong>
            <ChevronDown size={14} />
          </button>
          <div className="vaangly-location-badge">
            <span className="vaangly-location-pulse" />
            <span>Active Hometown Marketplace</span>
          </div>
        </div>
      </section>

      {/* 2. Hero Section */}
      <section className="vaangly-hero">
        <div className="container vaangly-hero__container">
          <div className="vaangly-hero__content">
            <div className="vaangly-hero__pill">
              <Sparkles size={15} />
              <span>Local • Trustworthy • Simple</span>
            </div>
            <h1 className="vaangly-hero__title">
              Everything You Need, <br />
              <span className="vaangly-hero__title--highlight">Right Around You.</span>
            </h1>
            <p className="vaangly-hero__subtitle">
              Discover local shops, products, services and appointments — all in one place with Vaangly.
            </p>
            <div className="vaangly-hero__actions">
              <Link to="/shops" className="vaangly-btn vaangly-btn--primary">
                Explore Vaangly <ArrowRight size={18} />
              </Link>
              <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--outline">
                Join as a Business
              </Link>
            </div>

            {/* Quick Hero Highlights */}
            <div className="vaangly-hero__features">
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>Verified Neighborhood Stores</span>
              </div>
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>Zero Wait Counter Pickup</span>
              </div>
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>Book Services & Clinics</span>
              </div>
            </div>
          </div>

          {/* Hero Visual — Local Ecosystem Showcase */}
          <div className="vaangly-hero__visual">
            <div className="vaangly-ecosystem-card">
              {/* Storefront Mini Badge 1: Grocery */}
              <div className="vaangly-mini-card vaangly-mini-card--grocery">
                <div className="vaangly-mini-card__icon">🥦</div>
                <div className="vaangly-mini-card__details">
                  <h4>Green Mart Provisions</h4>
                  <p>Farm-fresh vegetables & spices • 1.2 km</p>
                  <span className="vaangly-mini-card__status">Ready for Pickup</span>
                </div>
              </div>

              {/* Storefront Mini Badge 2: Bakery */}
              <div className="vaangly-mini-card vaangly-mini-card--bakery">
                <div className="vaangly-mini-card__icon">🥖</div>
                <div className="vaangly-mini-card__details">
                  <h4>Crown Bakery & Sweets</h4>
                  <p>Fresh whole wheat bread & snacks • 0.8 km</p>
                  <span className="vaangly-mini-card__price">Bread from ₹40</span>
                </div>
              </div>

              {/* Storefront Mini Badge 3: Appointment Booking */}
              <div className="vaangly-mini-card vaangly-mini-card--clinic">
                <div className="vaangly-mini-card__icon">🩺</div>
                <div className="vaangly-mini-card__details">
                  <h4>Ayush Care Clinic</h4>
                  <p>Dr. R. Vijayakumar (MBBS)</p>
                  <span className="vaangly-mini-card__slot">Today 5:30 PM Slot Open</span>
                </div>
              </div>

              {/* Storefront Mini Badge 4: Local Two-Wheeler Workshop */}
              <div className="vaangly-mini-card vaangly-mini-card--service">
                <div className="vaangly-mini-card__icon">🛵</div>
                <div className="vaangly-mini-card__details">
                  <h4>Velan Bike Workshop</h4>
                  <p>Quick oil service & brake repair • Verified</p>
                </div>
              </div>

              {/* Ecosystem Caption */}
              <div className="vaangly-ecosystem-footer">
                <Store size={16} />
                <span>Your local businesses, connected in one place.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Discover What's Around You */}
      <section className="vaangly-section" id="explore">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <h2 className="vaangly-section__title">Discover What's Around You</h2>
              <p className="vaangly-section__subtitle">
                Support authentic neighborhood stores, groceries, and trusted providers right in {selectedLocation.name}.
              </p>
            </div>
            <Link to="/shops" className="vaangly-link-action">
              <span>View all shops</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* Category Chips Bar */}
          <div className="vaangly-category-bar" role="tablist" aria-label="Business categories">
            {businessCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`vaangly-category-pill ${activeCategory === cat.id ? 'vaangly-category-pill--active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Business Cards Grid */}
          <div className="vaangly-cards-grid">
            {filteredShops.map((shop) => (
              <div key={shop.id} className="vaangly-shop-card">
                <div className="vaangly-shop-card__image-wrap">
                  <img src={shop.image} alt={shop.name} loading="lazy" className="vaangly-shop-card__img" />
                  <span className="vaangly-shop-card__badge">{shop.badge}</span>
                </div>
                <div className="vaangly-shop-card__body">
                  <div className="vaangly-shop-card__top">
                    <span className="vaangly-shop-card__category">{shop.category}</span>
                    <div className="vaangly-shop-card__rating">
                      <Star size={13} fill="#F59E0B" color="#F59E0B" />
                      <span>{shop.rating}</span>
                    </div>
                  </div>
                  <h3 className="vaangly-shop-card__name">{shop.name}</h3>
                  <p className="vaangly-shop-card__tagline">{shop.tagline}</p>
                  <div className="vaangly-shop-card__footer">
                    <span className="vaangly-shop-card__distance">
                      <MapPin size={13} />
                      {shop.distance}
                    </span>
                    <Link to="/shops" className="vaangly-shop-card__btn">
                      View Shop
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How Vaangly Works */}
      <section className="vaangly-section vaangly-section--alt" id="how-it-works">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">How Vaangly Works</h2>
            <p className="vaangly-section__subtitle">
              Four simple steps to connect with local merchants and skip unnecessary waiting.
            </p>
          </div>

          <div className="vaangly-steps-grid">
            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">01</div>
              <h3 className="vaangly-step-card__title">Discover</h3>
              <p className="vaangly-step-card__desc">
                Find shops, products, and services around you in your local hometown.
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">02</div>
              <h3 className="vaangly-step-card__title">Choose</h3>
              <p className="vaangly-step-card__desc">
                Browse products, select required package variants, or choose a convenient service.
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">03</div>
              <h3 className="vaangly-step-card__title">Order or Book</h3>
              <p className="vaangly-step-card__desc">
                Place your order request for counter pickup or book a reserved appointment slot.
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">04</div>
              <h3 className="vaangly-step-card__title">Get Notified</h3>
              <p className="vaangly-step-card__desc">
                Receive live updates when your merchant accepts, packs, or readies your request.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Product Discovery */}
      <section className="vaangly-section">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <h2 className="vaangly-section__title">Shop From Local Businesses</h2>
              <p className="vaangly-section__subtitle">
                Pre-order fresh essentials and household staples with clear variant options.
              </p>
            </div>
            <Link to="/shops?group=ORDER" className="vaangly-link-action">
              <span>View more products</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="vaangly-products-grid">
            {featuredProducts.map((prod) => (
              <div key={prod.id} className="vaangly-product-card">
                <div className="vaangly-product-card__image-box">
                  <img src={prod.image} alt={prod.name} loading="lazy" className="vaangly-product-card__img" />
                </div>
                <div className="vaangly-product-card__content">
                  <span className="vaangly-product-card__shop">{prod.shop}</span>
                  <h3 className="vaangly-product-card__title">{prod.name}</h3>

                  {/* Product Variants Pill Selector */}
                  {prod.variants.length > 0 && (
                    <div className="vaangly-product-card__variants" aria-label="Choose variant">
                      {prod.variants.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`vaangly-variant-chip ${selectedVariants[prod.id] === v ? 'vaangly-variant-chip--active' : ''}`}
                          onClick={() => handleVariantSelect(prod.id, v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="vaangly-product-card__bottom">
                    <div className="vaangly-product-card__price">
                      ₹{prod.price}
                    </div>
                    <button
                      type="button"
                      className="vaangly-product-card__add-btn"
                      onClick={() => handleQuickAdd(prod.id, prod.name, prod.price, prod.shop, prod.image)}
                      aria-label={`Add ${prod.name} to cart`}
                    >
                      <Plus size={16} />
                      <span>Add to Cart</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. More Than Shopping (Services + Appointments) */}
      <section className="vaangly-section vaangly-section--warm" id="services">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <div className="vaangly-badge-pill">
                <Calendar size={14} />
                <span>Appointments & Services</span>
              </div>
              <h2 className="vaangly-section__title">More Than Shopping</h2>
              <p className="vaangly-section__subtitle">
                Vaangly is not just shopping. Book appointments with clinics, grooming salons, and home service experts.
              </p>
            </div>
            <Link to="/shops?group=APPOINTMENT" className="vaangly-link-action">
              <span>View all services</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="vaangly-services-grid">
            {servicesList.map((service) => (
              <div key={service.id} className="vaangly-service-card">
                <div className="vaangly-service-card__image-wrap">
                  <img src={service.image} alt={service.title} loading="lazy" className="vaangly-service-card__img" />
                  <div className="vaangly-service-card__icon-badge">
                    {service.icon}
                  </div>
                </div>
                <div className="vaangly-service-card__body">
                  <span className="vaangly-service-card__business">{service.business}</span>
                  <h3 className="vaangly-service-card__title">{service.title}</h3>
                  <p className="vaangly-service-card__info">{service.info}</p>
                  <div className="vaangly-service-card__footer">
                    <span className="vaangly-service-card__duration">
                      <Clock size={14} /> {service.duration}
                    </span>
                    <button
                      type="button"
                      className="vaangly-service-card__book-btn"
                      onClick={() => navigate(service.actionUrl)}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. For Business Owners */}
      <section className="vaangly-section vaangly-section--business" id="for-businesses">
        <div className="container vaangly-business__container">
          <div className="vaangly-business__content">
            <div className="vaangly-badge-pill vaangly-badge-pill--accent">
              <Building2 size={14} />
              <span>For Neighborhood Merchants</span>
            </div>
            <h2 className="vaangly-business__title">Bring Your Local Business Online.</h2>
            <p className="vaangly-business__subtitle">
              Reach nearby customers, manage orders and appointments, and grow your business with Vaangly.
            </p>

            <ul className="vaangly-business__benefits">
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>Create your business profile with verified storefront credentials</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>Add products, package sizes, and custom service offerings</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>Receive customer orders with direct counter pickup and UPI payments</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>Manage appointments and patient/client queue slots effortlessly</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>Track your business performance with real-time analytics</span>
              </li>
            </ul>

            <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--primary vaangly-btn--lg">
              Join Vaangly <ArrowRight size={18} />
            </Link>
          </div>

          <div className="vaangly-business__visual">
            <div className="vaangly-merchant-card">
              <div className="vaangly-merchant-card__top">
                <img
                  src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=800&auto=format&fit=crop&q=80"
                  alt="Local Shopkeeper"
                  className="vaangly-merchant-card__img"
                />
                <div className="vaangly-merchant-card__badge">
                  <CheckCircle2 size={16} />
                  <span>Verified Merchant</span>
                </div>
              </div>
              <div className="vaangly-merchant-card__content">
                <h3>K. Senthil Nathan</h3>
                <p>Proprietor, Karpagam Silks & Provisions</p>
                <div className="vaangly-merchant-stat-grid">
                  <div className="vaangly-merchant-stat">
                    <strong>100%</strong>
                    <span>Local Orders</span>
                  </div>
                  <div className="vaangly-merchant-stat">
                    <strong>Zero</strong>
                    <span>Middleman Fees</span>
                  </div>
                  <div className="vaangly-merchant-stat">
                    <strong>Direct</strong>
                    <span>UPI Settlement</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Trust & Community Section */}
      <section className="vaangly-section" id="about">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <div className="vaangly-badge-pill">
              <Users size={14} />
              <span>Community First</span>
            </div>
            <h2 className="vaangly-section__title">Built Around Local Businesses.</h2>
            <p className="vaangly-section__subtitle" style={{ maxWidth: '680px', margin: '0 auto' }}>
              Vaangly helps customers discover the businesses they already know — and the ones they haven't discovered yet.
            </p>
          </div>

          <div className="vaangly-trust-grid">
            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <ShieldCheck size={26} />
              </div>
              <h3>Verified Storefronts</h3>
              <p>Every business on Vaangly is physically verified with real storefront photos, GPS location, and proprietor identity proofs.</p>
            </div>

            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <Clock size={26} />
              </div>
              <h3>Direct & Punctual</h3>
              <p>Skip crowded counters. Send orders ahead of time and pick up your packed items with zero waiting lines.</p>
            </div>

            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <Heart size={26} />
              </div>
              <h3>Hometown Prosperity</h3>
              <p>Keep your spending in the local community. Money circulates directly between local shoppers and neighborhood merchants.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Vaangly App Section */}
      <section className="vaangly-section vaangly-section--alt">
        <div className="container vaangly-app-section">
          <div className="vaangly-app-section__content">
            <div className="vaangly-badge-pill">
              <Smartphone size={14} />
              <span>Mobile Experience</span>
            </div>
            <h2 className="vaangly-section__title">Your Local Marketplace, In Your Pocket.</h2>
            <p className="vaangly-section__subtitle">
              Browse shops on the street, track packing progress in real time, and book medical or salon tokens whenever you need them.
            </p>

            <div className="vaangly-app-features-list">
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>Live order status tracking & readiness notifications</span>
              </div>
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>Instant appointment booking with verified time slots</span>
              </div>
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>Direct merchant contact and direct UPI payments</span>
              </div>
            </div>

            <div className="vaangly-app-ctas">
              <Link to="/shops" className="vaangly-btn vaangly-btn--primary">
                Explore Vaangly <ArrowRight size={16} />
              </Link>
              <button
                type="button"
                className="vaangly-btn vaangly-btn--outline"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  success('Vaangly is available instantly in your browser! Add to Home Screen via browser menu.');
                }}
              >
                Get the App
              </button>
            </div>

            {/* Store Badges Placeholders */}
            <div className="vaangly-store-badges">
              <div className="vaangly-store-badge">
                <span className="vaangly-store-badge__sub">Available as</span>
                <strong className="vaangly-store-badge__name">Mobile Web App (PWA)</strong>
              </div>
              <div className="vaangly-store-badge">
                <span className="vaangly-store-badge__sub">Play Store & App Store</span>
                <strong className="vaangly-store-badge__name">Coming Soon</strong>
              </div>
            </div>
          </div>

          <div className="vaangly-app-section__mockup">
            <div className="vaangly-phone-frame">
              <div className="vaangly-phone-header">
                <span className="vaangly-phone-notch" />
              </div>
              <div className="vaangly-phone-screen">
                <div className="vaangly-phone-appbar">
                  <strong>VAANGLY</strong>
                  <span className="vaangly-phone-badge">{selectedLocation.name}</span>
                </div>
                <div className="vaangly-phone-content">
                  <div className="vaangly-phone-card">
                    <span className="vaangly-phone-card__title">Order #4821 Ready</span>
                    <p>Green Mart • 3 items packed</p>
                    <span className="vaangly-phone-pill">Pickup at Counter</span>
                  </div>
                  <div className="vaangly-phone-card vaangly-phone-card--slot">
                    <span className="vaangly-phone-card__title">Clinic Token Confirmed</span>
                    <p>Ayush Clinic • Slot 04 (5:30 PM)</p>
                  </div>
                  <div className="vaangly-phone-quick-shops">
                    <div className="vaangly-phone-thumb">🥦 Groceries</div>
                    <div className="vaangly-phone-thumb">🥖 Bakery</div>
                    <div className="vaangly-phone-thumb">✂️ Salon</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Testimonials */}
      <section className="vaangly-section">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">Loved by Customers & Shopkeepers</h2>
            <p className="vaangly-section__subtitle">
              Real feedback from community members and local business owners.
            </p>
          </div>

          <div className="vaangly-testimonials-grid">
            {/* Customer Testimonial */}
            <div className="vaangly-testimonial-card">
              <div className="vaangly-testimonial-badge">Customer</div>
              <p className="vaangly-testimonial-quote">
                "I can find nearby shops and place orders without having to search for every business separately."
              </p>
              <div className="vaangly-testimonial-author">
                <div className="vaangly-testimonial-avatar">A</div>
                <div>
                  <strong>Ananya Raman</strong>
                  <span>Resident, Kangeyam</span>
                </div>
              </div>
            </div>

            {/* Shopkeeper Testimonial */}
            <div className="vaangly-testimonial-card vaangly-testimonial-card--merchant">
              <div className="vaangly-testimonial-badge vaangly-testimonial-badge--merchant">Shopkeeper</div>
              <p className="vaangly-testimonial-quote">
                "Vaangly gives my shop a simple way to reach customers nearby."
              </p>
              <div className="vaangly-testimonial-author">
                <div className="vaangly-testimonial-avatar vaangly-testimonial-avatar--merchant">S</div>
                <div>
                  <strong>K. Senthil Nathan</strong>
                  <span>Owner, Grocery & Spices</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 11. FAQ Section */}
      <section className="vaangly-section vaangly-section--alt" id="faq">
        <div className="container" style={{ maxWidth: '820px' }}>
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">Frequently Asked Questions</h2>
            <p className="vaangly-section__subtitle">
              Everything you need to know about shopping, booking, and joining Vaangly.
            </p>
          </div>

          <div className="vaangly-accordion">
            {faqList.map((item, idx) => (
              <div
                key={idx}
                className={`vaangly-accordion__item ${openFaq === idx ? 'vaangly-accordion__item--open' : ''}`}
              >
                <button
                  type="button"
                  className="vaangly-accordion__trigger"
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={openFaq === idx}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="vaangly-accordion__arrow" />
                </button>
                {openFaq === idx && (
                  <div className="vaangly-accordion__content">
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 12. Final CTA Section */}
      <section className="vaangly-final-cta">
        <div className="container vaangly-final-cta__inner">
          <div className="vaangly-final-cta__badge">
            <Sparkles size={14} />
            <span>Join the Community</span>
          </div>
          <h2 className="vaangly-final-cta__title">Your Local Businesses. One Vaangly.</h2>
          <p className="vaangly-final-cta__subtitle">
            Discover, order and book from businesses around you.
          </p>
          <div className="vaangly-final-cta__actions">
            <Link to="/shops" className="vaangly-btn vaangly-btn--primary vaangly-btn--lg">
              Explore Vaangly <ArrowRight size={18} />
            </Link>
            <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--white vaangly-btn--lg">
              Join as a Business
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
