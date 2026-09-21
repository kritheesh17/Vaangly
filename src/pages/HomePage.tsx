import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCustomerLocationCatalog } from '../lib/search';
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
  Heart,
  ShoppingBag,
} from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { Shop, ShopProduct } from '../types/database';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const { selectedLocation, setIsLocationModalOpen } = useLocationContext();
  const { addItem } = useCart();
  const { success, error: toastError } = useToast();
  const { t, language } = useLanguage();
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

  const handleQuickAdd = (
    id: string,
    name: string,
    price: number,
    shopId: string,
    shopName: string,
    imageUrl: string
  ) => {
    const variant = selectedVariants[id];
    const demoShop: Shop = {
      id: shopId,
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
      upi_id: 'merchant@upi',
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
    const res = addItem(demoProduct, demoShop);
    if (res.success) {
      success(t('addedToCart', { product: name }));
    } else if (res.requiresClear) {
      toastError(language === 'ta' ? 'உங்கள் கூடையில் வேறு கடையின் பொருட்கள் உள்ளன. அதை முடித்தபின் புதிய கடையைத் தொடங்குங்கள்.' : 'Your cart contains items from another shop. Please finish or clear your existing order.');
    } else if (res.error) {
      toastError(res.error);
    }
  };

  const businessCategories = [
    { id: 'all', label: t('allBusinesses'), emoji: '🏬' },
    { id: 'groceries', label: t('groceriesCategory'), emoji: '🥦' },
    { id: 'bakery', label: t('bakeryCategory'), emoji: '🥖' },
    { id: 'fashion', label: t('fashionCategory'), emoji: '👗' },
    { id: 'salon', label: t('salonCategory'), emoji: '✂️' },
    { id: 'health', label: t('healthCategory'), emoji: '🩺' },
    { id: 'home', label: t('homeCategory'), emoji: '🔧' },
    { id: 'electronics', label: t('electronicsCategory'), emoji: '📱' },
    { id: 'services', label: t('servicesCategory'), emoji: '🛵' },
  ];

  const featuredShops = [
    {
      id: 'shop-1',
      name: 'Green Mart Provisions',
      category: t('groceriesCategory'),
      categoryKey: 'groceries',
      distance: '1.2 km away',
      location: selectedLocation.name,
      rating: 4.8,
      reviewsCount: 142,
      tagline: 'Farm-fresh vegetables, cold-pressed oils & pulses',
      image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
      badge: t('fastCounterPickup'),
    },
    {
      id: 'shop-2',
      name: 'Crown Bakery & Sweets',
      category: t('bakeryCategory'),
      categoryKey: 'bakery',
      distance: '0.8 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 210,
      tagline: 'Fresh wheat bread, butter cookies & evening hot snacks',
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80',
      badge: t('freshDaily'),
    },
    {
      id: 'shop-3',
      name: 'Karpagam Silks & Tailors',
      category: t('fashionCategory'),
      categoryKey: 'fashion',
      distance: '1.5 km away',
      location: selectedLocation.name,
      rating: 4.7,
      reviewsCount: 88,
      tagline: 'Traditional sarees, cotton shirts & expert alterations',
      image: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&auto=format&fit=crop&q=80',
      badge: t('customStitching'),
    },
    {
      id: 'shop-4',
      name: 'Ayush Care Clinic & Pharmacy',
      category: t('healthCategory'),
      categoryKey: 'health',
      distance: '0.5 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 164,
      tagline: 'Consultation tokens, daily prescription refills & baby care',
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&auto=format&fit=crop&q=80',
      badge: t('verifiedDoctor'),
    },
    {
      id: 'shop-5',
      name: 'Elite Grooming Studio & Salon',
      category: t('salonCategory'),
      categoryKey: 'salon',
      distance: '1.0 km away',
      location: selectedLocation.name,
      rating: 4.8,
      reviewsCount: 125,
      tagline: 'Modern haircuts, beard sculpting & skin rejuvenation',
      image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
      badge: t('appointmentsOpen'),
    },
    {
      id: 'shop-6',
      name: 'Velan Two-Wheeler Workshop',
      category: t('servicesCategory'),
      categoryKey: 'services',
      distance: '2.1 km away',
      location: selectedLocation.name,
      rating: 4.9,
      reviewsCount: 94,
      tagline: 'Oil servicing, electrical repair & periodic tune-ups',
      image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=800&auto=format&fit=crop&q=80',
      badge: t('serviceSlotsAvailable'),
    },
  ];

  const [liveShops, setLiveShops] = useState<any[]>([]);
  const [liveShopTypes, setLiveShopTypes] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    fetchCustomerLocationCatalog(selectedLocation.id).then((catalog) => {
      if (active && catalog.shops && catalog.shops.length > 0) {
        setLiveShops(catalog.shops);
        setLiveShopTypes(catalog.shopTypes);
      } else if (active) {
        setLiveShops([]);
        setLiveShopTypes([]);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedLocation.id]);

  const liveCards = useMemo(() => {
    if (!liveShops || liveShops.length === 0) return null;
    return liveShops.map((s) => {
      const shopType = liveShopTypes.find((t) => t.id === s.shop_type_id || t.code === s.shop_type_id);
      const categoryLabel = shopType?.name || t('groceriesCategory');
      const categoryKey = (shopType?.code || 'groceries').toLowerCase();
      return {
        id: s.id,
        name: s.name,
        category: categoryLabel,
        categoryKey,
        distance: `${selectedLocation.name}`,
        location: selectedLocation.name,
        rating: s.rating || 5.0,
        reviewsCount: s.reviews_count || 1,
        tagline: s.tagline || s.address_line,
        image: s.photo_url || 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
        badge: s.delivery_available ? t('fastCounterPickup') : t('activeMarketplace'),
        isLive: true,
      };
    });
  }, [liveShops, liveShopTypes, selectedLocation.name, t]);

  const displayedShops = liveCards || featuredShops;

  const filteredShops = activeCategory === 'all'
    ? displayedShops
    : displayedShops.filter((s) => {
        if (s.categoryKey === activeCategory) return true;
        if (activeCategory === 'groceries' && s.categoryKey === 'grocery') return true;
        return false;
      });

  const featuredProducts = [
    {
      id: '40000000-0000-0000-0000-000000000001',
      name: 'Country Tomatoes (நாட்டு தக்காளி)',
      shop: 'Green Mart Provisions',
      shopId: '30000000-0000-0000-0000-000000000001',
      price: 32,
      variants: ['500 g', '1 kg'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: '40000000-0000-0000-0000-000000000002',
      name: 'Small Shallots (சின்ன வெங்காயம்)',
      shop: 'Green Mart Provisions',
      shopId: '30000000-0000-0000-0000-000000000001',
      price: 58,
      variants: ['500 g', '1 kg'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: '40000000-0000-0000-0000-000000000007',
      name: 'Fresh Butter Milk Bread (ரொட்டி)',
      shop: 'Crown Bakery & Sweets',
      shopId: '30000000-0000-0000-0000-000000000002',
      price: 45,
      variants: ['Standard', 'Large'],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
    },
    {
      id: '40000000-0000-0000-0000-000000000008',
      name: 'Crispy Veg Puff (காய்கறி பப்ஸ்)',
      shop: 'Crown Bakery & Sweets',
      shopId: '30000000-0000-0000-0000-000000000002',
      price: 20,
      variants: [],
      isAvailable: true,
      image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
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
      q: language === 'ta' ? 'வாங்கோ என்றால் என்ன?' : 'What is Vaangly?',
      a: language === 'ta'
        ? 'வாங்கோ என்பது உங்கள் ஊரில் உள்ள கடைகள், சேவைகள் மற்றும் முன்பதிவு வழங்குநர்களை இணைக்கும் எளிய உள்ளூர் தளமாகும். மளிகைப் பொருட்களை முன்கூட்டியே ஆர்டர் செய்யவும், மருத்துவர் மற்றும் சலூன் நேரங்களை முன்பதிவு செய்யவும் உதவுகிறது.'
        : 'Vaangly is a local commerce and services platform that connects customers with verified nearby shops, services, and appointment providers in their hometown. You can discover local businesses, pre-order groceries and daily essentials, and book service appointments with trusted community professionals.',
    },
    {
      q: language === 'ta' ? 'வாங்கோ எவ்வாறு செயல்படுகிறது?' : 'How does Vaangly work?',
      a: language === 'ta'
        ? 'உங்கள் ஊரைத் தேர்வு செய்து அருகிலுள்ள கடைகளைக் காணலாம். பொருட்களை தேர்வு செய்து ஆர்டர் அனுப்பலாம், சலூன் அல்லது கிளினிக் நேரம் முன்பதிவு செய்யலாம் அல்லது வீட்டு பழுதுபார்ப்பு சேவைகளைக் கோரலாம்.'
        : 'Simply select your town to see nearby businesses. You can browse products to place order requests, book scheduled appointment slots for salons or clinics, or request home repairs. Merchants confirm your request and update you in real time when items are packed or ready.',
    },
    {
      q: language === 'ta' ? 'உள்ளூர் கடைகளில் எவ்வாறு ஆர்டர் செய்வது?' : 'Can I order from local shops?',
      a: language === 'ta'
        ? 'ஆம். உங்கள் பகுதி மளிகைக் கடைகள், பேக்கரிகள் மற்றும் மருந்தகங்களின் தயாரிப்புகளைப் பார்த்து கூடையில் சேர்த்து கோரிக்கை அனுப்பலாம். கடையில் நேரில் சென்று பெறலாம் அல்லது டெலிவரி பெறலாம்.'
        : 'Yes. You can browse catalogs from local grocery stores, bakeries, eateries, and pharmacies, add items to your cart, and place an order request. You can choose counter pickup to skip waiting lines or select local doorstep delivery where offered.',
    },
    {
      q: language === 'ta' ? 'முன்பதிவு (Appointments) செய்ய முடியுமா?' : 'Can I book appointments?',
      a: language === 'ta'
        ? 'கண்டிப்பாக! முடித்திருத்தகம், அழகு நிலையம், பல் மற்றும் பொது மருத்துவ கிளினிக்குகளில் வரிசையில் காத்திருக்காமல் உங்களுக்கு வசதியான நேரத்தை நேரடியாக முன்பதிவு செய்யலாம்.'
        : 'Yes! Vaangly is not just shopping. You can book guaranteed appointment slots at neighborhood clinics, barbershops, salons, dental care centers, and diagnostic labs without waiting in long queues.',
    },
    {
      q: language === 'ta' ? 'கடைக்காரர்கள் எப்படி இணையலாம்?' : 'How can businesses join Vaangly?',
      a: language === 'ta'
        ? 'எந்தவொரு உள்ளூர் கடை அல்லது சேவை வழங்குநரும் "கடையைத் தொடங்குங்கள்" அல்லது "விண்ணப்பிக்கவும்" பொத்தானைக் கிளிக் செய்து, அடிப்படை விவரங்கள் மற்றும் ஆவணங்களைச் சமர்ப்பித்து நிர்வாக ஒப்புதல் பெறலாம்.'
        : 'Any verified local merchant or service provider can click "Open Your Shop on Vaangly", submit basic shop details, storefront photos, and verification documents to start receiving orders and appointment requests.',
    },
    {
      q: language === 'ta' ? 'ஆர்டர் நிலையை எவ்வாறு அறிந்து கொள்வது?' : 'How are order updates provided?',
      a: language === 'ta'
        ? 'ஆர்டர் ஏற்றுக்கொள்ளப்பட்டது, பேக் செய்யப்படுகிறது, தயாராகிவிட்டது போன்ற அனைத்து நிலைகளும் உங்கள் தொலைபேசியில் நேரலையாகத் தெரிவிக்கப்படும்.'
        : 'Both customers and shopkeepers receive real-time notifications when an order is received, accepted, packed, or ready for pickup. Live status tracking keeps everyone informed without constant phone calls.',
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
            aria-label={`${t('browsingIn')} ${selectedLocation.name}. ${t('changeLocation')}.`}
          >
            <MapPin size={16} className="vaangly-location-icon" />
            <span className="vaangly-location-label">{t('browsingIn')}</span>
            <strong className="vaangly-location-name">
              {selectedLocation.name}, {selectedLocation.state}
            </strong>
            <ChevronDown size={14} />
          </button>
          <div className="vaangly-location-badge">
            <span className="vaangly-location-pulse" />
            <span>{t('activeMarketplace')}</span>
          </div>
        </div>
      </section>

      {/* 2. Hero Section — Primary Proposition */}
      <section className="vaangly-hero">
        <div className="container vaangly-hero__container">
          <div className="vaangly-hero__content">
            <div className="vaangly-hero__pill">
              <Sparkles size={15} />
              <span>{t('heroPill')}</span>
            </div>
            <h1 className="vaangly-hero__title">
              {t('heroTitlePrefix')} <br />
              <span className="vaangly-hero__title--highlight">{t('heroTitleHighlight')}</span>
            </h1>
            <p className="vaangly-hero__subtitle">
              {t('heroSubtitle')}
            </p>
            <div className="vaangly-hero__actions">
              <Link to="/shops?group=ORDER" className="vaangly-btn vaangly-btn--primary">
                {t('heroStartOrdering')} <ArrowRight size={18} />
              </Link>
              <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--outline">
                {t('heroOpenShop')}
              </Link>
            </div>

            {/* Quick Hero Highlights */}
            <div className="vaangly-hero__features">
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>{t('heroFeatureStores')}</span>
              </div>
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>{t('heroFeaturePickup')}</span>
              </div>
              <div className="vaangly-hero__feature-item">
                <CheckCircle2 size={16} className="vaangly-hero__check" />
                <span>{t('heroFeatureServices')}</span>
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
                  <span className="vaangly-mini-card__status">{t('status_READY')}</span>
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
                  <span className="vaangly-mini-card__slot">{t('appointmentsOpen')}</span>
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
                <span>{t('tagline')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROMINENT 3 CORE ACTION ENTRY POINTS (ORDER, APPOINTMENTS, SERVICES) */}
      <section className="vaangly-core-actions-section" id="core-actions">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">{t('coreActionsTitle')}</h2>
            <p className="vaangly-section__subtitle">
              {t('coreActionsSubtitle', { location: selectedLocation.name })}
            </p>
          </div>

          <div className="vaangly-core-actions-grid">
            {/* 1. ORDER */}
            <Link to="/shops?group=ORDER" className="vaangly-core-action-card vaangly-core-action-card--order">
              <div className="vaangly-core-action-badge vaangly-core-action-badge--order">
                <ShoppingBag size={14} />
                <span>1. {t('coreOrderTitle')}</span>
              </div>
              <h3 className="vaangly-core-action-title">{t('coreOrderTitle')}</h3>
              <div className="vaangly-core-action-sub">{t('coreOrderSubtitle')}</div>
              <p className="vaangly-core-action-desc">{t('coreOrderDesc')}</p>
              <div className="vaangly-core-action-btn">
                <span>{t('coreOrderAction')}</span>
                <ArrowRight size={16} />
              </div>
            </Link>

            {/* 2. APPOINTMENTS */}
            <Link to="/shops?group=APPOINTMENT" className="vaangly-core-action-card vaangly-core-action-card--appointments">
              <div className="vaangly-core-action-badge vaangly-core-action-badge--appointments">
                <Calendar size={14} />
                <span>2. {t('coreAppointmentsTitle')}</span>
              </div>
              <h3 className="vaangly-core-action-title">{t('coreAppointmentsTitle')}</h3>
              <div className="vaangly-core-action-sub">{t('coreAppointmentsSubtitle')}</div>
              <p className="vaangly-core-action-desc">{t('coreAppointmentsDesc')}</p>
              <div className="vaangly-core-action-btn">
                <span>{t('coreAppointmentsAction')}</span>
                <ArrowRight size={16} />
              </div>
            </Link>

            {/* 3. SERVICES */}
            <Link to="/shops?group=SERVICE" className="vaangly-core-action-card vaangly-core-action-card--services">
              <div className="vaangly-core-action-badge vaangly-core-action-badge--services">
                <Wrench size={14} />
                <span>3. {t('coreServicesTitle')}</span>
              </div>
              <h3 className="vaangly-core-action-title">{t('coreServicesTitle')}</h3>
              <div className="vaangly-core-action-sub">{t('coreServicesSubtitle')}</div>
              <p className="vaangly-core-action-desc">{t('coreServicesDesc')}</p>
              <div className="vaangly-core-action-btn">
                <span>{t('coreServicesAction')}</span>
                <ArrowRight size={16} />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Discover What's Around You */}
      <section className="vaangly-section" id="explore">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <h2 className="vaangly-section__title">{t('discoverTitle')}</h2>
              <p className="vaangly-section__subtitle">
                {t('discoverSubtitle', { location: selectedLocation.name })}
              </p>
            </div>
            <Link to="/shops" className="vaangly-link-action">
              <span>{t('viewAllShops')}</span>
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
                    <Link to={(shop as any).isLive ? `/shop/${shop.id}` : '/shops'} className="vaangly-shop-card__btn">
                      {t('viewShop')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. How Vaangly Works */}
      <section className="vaangly-section vaangly-section--alt" id="how-it-works">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">{t('navHowItWorks')}</h2>
            <p className="vaangly-section__subtitle">
              {language === 'ta'
                ? 'உள்ளூர் வணிகங்களுடன் எளிதாக இணைய 4 எளிய வழிகள்.'
                : 'Four simple steps to connect with local merchants and skip unnecessary waiting.'}
            </p>
          </div>

          <div className="vaangly-steps-grid">
            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">01</div>
              <h3 className="vaangly-step-card__title">{language === 'ta' ? 'கண்டறியுங்கள்' : 'Discover'}</h3>
              <p className="vaangly-step-card__desc">
                {language === 'ta'
                  ? 'உங்கள் ஊரில் உள்ள கடைகள், பொருட்கள் மற்றும் சேவைகளைக் கண்டறியுங்கள்.'
                  : 'Find shops, products, and services around you in your local hometown.'}
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">02</div>
              <h3 className="vaangly-step-card__title">{language === 'ta' ? 'தேர்வு செய்யுங்கள்' : 'Choose'}</h3>
              <p className="vaangly-step-card__desc">
                {language === 'ta'
                  ? 'தேவையான பொருட்கள், அளவுகள் அல்லது வசதியான நேரத்தைத் தேர்வு செய்யுங்கள்.'
                  : 'Browse products, select required package variants, or choose a convenient service.'}
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">03</div>
              <h3 className="vaangly-step-card__title">{language === 'ta' ? 'ஆர்டர் அல்லது முன்பதிவு' : 'Order or Book'}</h3>
              <p className="vaangly-step-card__desc">
                {language === 'ta'
                  ? 'பொருட்களை ஆர்டர் செய்யுங்கள் அல்லது கிளினிக்/சலூன் நேரத்தை முன்பதிவு செய்யுங்கள்.'
                  : 'Place your order request for counter pickup or book a reserved appointment slot.'}
              </p>
            </div>

            <div className="vaangly-step-card">
              <div className="vaangly-step-card__number">04</div>
              <h3 className="vaangly-step-card__title">{language === 'ta' ? 'தகவல் பெறுங்கள்' : 'Get Notified'}</h3>
              <p className="vaangly-step-card__desc">
                {language === 'ta'
                  ? 'கடைக்காரர் ஏற்றதும், தயாரானதும் உடனுக்குடன் அறிவிப்பு பெறுங்கள்.'
                  : 'Receive live updates when your merchant accepts, packs, or readies your request.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Shop From Local Businesses (Products) */}
      <section className="vaangly-section">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <h2 className="vaangly-section__title">{t('shopFromLocal')}</h2>
              <p className="vaangly-section__subtitle">
                {t('shopFromLocalSubtitle')}
              </p>
            </div>
            <Link to="/shops?group=ORDER" className="vaangly-link-action">
              <span>{t('viewMoreProducts')}</span>
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
                    <div className="vaangly-product-card__variants" aria-label={t('chooseVariant')}>
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
                      onClick={() => handleQuickAdd(prod.id, prod.name, prod.price, prod.shopId, prod.shop, prod.image)}
                      aria-label={`${t('addToCart')} ${prod.name}`}
                    >
                      <Plus size={16} />
                      <span>{t('addToCart')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. More Than Shopping (Services + Appointments) */}
      <section className="vaangly-section vaangly-section--warm" id="services">
        <div className="container">
          <div className="vaangly-section__header">
            <div>
              <div className="vaangly-badge-pill">
                <Calendar size={14} />
                <span>{t('navAppointments')} & {t('navServices')}</span>
              </div>
              <h2 className="vaangly-section__title">{t('moreThanShopping')}</h2>
              <p className="vaangly-section__subtitle">
                {t('moreThanShoppingSubtitle')}
              </p>
            </div>
            <Link to="/shops?group=APPOINTMENT" className="vaangly-link-action">
              <span>{t('viewAllServices')}</span>
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
                      {t('bookNow')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Open Your Shop on Vaangly (Replaced Business Section) */}
      <section className="vaangly-section vaangly-section--business" id="open-your-shop">
        <div className="container vaangly-business__container">
          <div className="vaangly-business__content">
            <div className="vaangly-badge-pill vaangly-badge-pill--accent">
              <Building2 size={14} />
              <span>{t('navOpenShop')}</span>
            </div>
            <h2 className="vaangly-business__title">{t('openShopSectionTitle')}</h2>
            <p className="vaangly-business__subtitle">
              {t('openShopSectionSubtitle')}
            </p>

            <ul className="vaangly-business__benefits">
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>{t('openShopStep1')}</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>{t('openShopStep2')}</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>{t('openShopStep3')}</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>{t('openShopStep4')}</span>
              </li>
              <li>
                <div className="vaangly-benefit-check"><Check size={16} /></div>
                <span>{t('openShopStep5')}</span>
              </li>
            </ul>

            <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--primary vaangly-btn--lg">
              {t('applyShopCta')} <ArrowRight size={18} />
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
                  <span>{t('verifiedMerchantBadge')}</span>
                </div>
              </div>
              <div className="vaangly-merchant-card__content">
                <h3>K. Senthil Nathan</h3>
                <p>Proprietor, Karpagam Silks & Provisions</p>
                <div className="vaangly-merchant-stat-grid">
                  <div className="vaangly-merchant-stat">
                    <strong>100%</strong>
                    <span>{t('localOrdersStat')}</span>
                  </div>
                  <div className="vaangly-merchant-stat">
                    <strong>Zero</strong>
                    <span>{t('zeroFeesStat')}</span>
                  </div>
                  <div className="vaangly-merchant-stat">
                    <strong>Direct</strong>
                    <span>{t('directUpiStat')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Trust & Community Section */}
      <section className="vaangly-section" id="about">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <div className="vaangly-badge-pill">
              <Users size={14} />
              <span>Community First</span>
            </div>
            <h2 className="vaangly-section__title">{t('communityTitle')}</h2>
            <p className="vaangly-section__subtitle" style={{ maxWidth: '680px', margin: '0 auto' }}>
              {t('communitySubtitle')}
            </p>
          </div>

          <div className="vaangly-trust-grid">
            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <ShieldCheck size={26} />
              </div>
              <h3>{t('trustVerifiedTitle')}</h3>
              <p>{t('trustVerifiedDesc')}</p>
            </div>

            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <Clock size={26} />
              </div>
              <h3>{t('trustPunctualTitle')}</h3>
              <p>{t('trustPunctualDesc')}</p>
            </div>

            <div className="vaangly-trust-item">
              <div className="vaangly-trust-icon">
                <Heart size={26} />
              </div>
              <h3>{t('trustProsperityTitle')}</h3>
              <p>{t('trustProsperityDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Vaangly App Section */}
      <section className="vaangly-section vaangly-section--alt">
        <div className="container vaangly-app-section">
          <div className="vaangly-app-section__content">
            <div className="vaangly-badge-pill">
              <Smartphone size={14} />
              <span>Mobile Experience</span>
            </div>
            <h2 className="vaangly-section__title">{t('appSectionTitle')}</h2>
            <p className="vaangly-section__subtitle">
              {t('appSectionSubtitle')}
            </p>

            <div className="vaangly-app-features-list">
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>{t('appFeature1')}</span>
              </div>
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>{t('appFeature2')}</span>
              </div>
              <div className="vaangly-app-feature">
                <div className="vaangly-app-feature__bullet" />
                <span>{t('appFeature3')}</span>
              </div>
            </div>

            <div className="vaangly-app-ctas">
              <Link to="/shops?group=ORDER" className="vaangly-btn vaangly-btn--primary">
                {t('heroStartOrdering')} <ArrowRight size={16} />
              </Link>
              <button
                type="button"
                className="vaangly-btn vaangly-btn--outline"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  success('Vaangly is available instantly in your browser! Add to Home Screen via browser menu.');
                }}
              >
                {t('getAppBtn')}
              </button>
            </div>

            {/* Store Badges Placeholders */}
            <div className="vaangly-store-badges">
              <div className="vaangly-store-badge">
                <span className="vaangly-store-badge__sub">Available as</span>
                <strong className="vaangly-store-badge__name">{t('pwaBadge')}</strong>
              </div>
              <div className="vaangly-store-badge">
                <span className="vaangly-store-badge__sub">Mobile App</span>
                <strong className="vaangly-store-badge__name">{t('playStoreComingSoon')}</strong>
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
                    <span className="vaangly-phone-pill">{t('counterPickup')}</span>
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

      {/* 11. Testimonials */}
      <section className="vaangly-section">
        <div className="container">
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">{t('testimonialsTitle')}</h2>
            <p className="vaangly-section__subtitle">
              {t('testimonialsSubtitle')}
            </p>
          </div>

          <div className="vaangly-testimonials-grid">
            {/* Customer Testimonial */}
            <div className="vaangly-testimonial-card">
              <div className="vaangly-testimonial-badge">{t('customerBadge')}</div>
              <p className="vaangly-testimonial-quote">
                {language === 'ta'
                  ? '"அருகிலுள்ள கடைகளை எளிதாகக் கண்டுபிடித்து, தனியாக ஒவ்வொரு கடையையும் தேடாமல் ஆர்டர் செய்ய வாங்கோ மிகவும் பயனுள்ளதாக உள்ளது."'
                  : '"I can find nearby shops and place orders without having to search for every business separately."'}
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
              <div className="vaangly-testimonial-badge vaangly-testimonial-badge--merchant">{t('shopkeeperBadge')}</div>
              <p className="vaangly-testimonial-quote">
                {language === 'ta'
                  ? '"எங்கள் கடைக்கு அருகிலுள்ள புதிய வாடிக்கையாளர்களை எந்தவொரு கூடுதல் கட்டணமும் இல்லாமல் அடைய வாங்கோ எளிய வழியை வழங்குகிறது."'
                  : '"Vaangly gives my shop a simple way to reach customers nearby."'}
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

      {/* 12. FAQ Section */}
      <section className="vaangly-section vaangly-section--alt" id="faq">
        <div className="container" style={{ maxWidth: '820px' }}>
          <div className="vaangly-section__header vaangly-section__header--center">
            <h2 className="vaangly-section__title">{t('faqTitle')}</h2>
            <p className="vaangly-section__subtitle">
              {t('faqSubtitle')}
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

      {/* 13. Final CTA Section */}
      <section className="vaangly-final-cta">
        <div className="container vaangly-final-cta__inner">
          <div className="vaangly-final-cta__badge">
            <Sparkles size={14} />
            <span>{t('joinCommunity')}</span>
          </div>
          <h2 className="vaangly-final-cta__title">{t('finalCtaTitle')}</h2>
          <p className="vaangly-final-cta__subtitle">
            {t('finalCtaSubtitle')}
          </p>
          <div className="vaangly-final-cta__actions">
            <Link to="/shops?group=ORDER" className="vaangly-btn vaangly-btn--primary vaangly-btn--lg">
              {t('heroStartOrdering')} <ArrowRight size={18} />
            </Link>
            <Link to="/shopkeeper/apply" className="vaangly-btn vaangly-btn--white vaangly-btn--lg">
              {t('applyShopCta')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
