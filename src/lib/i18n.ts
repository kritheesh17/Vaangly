// Lightweight internationalization foundation for Vaango (English & Tamil)

export type Language = 'en' | 'ta';

export const DICTIONARY = {
  en: {
    brand: 'Vaango',
    tagline: 'Your Neighborhood Shops, Directly Connected',
    location: 'Location',
    changeLocation: 'Change Location',
    whatDoYouWant: 'What do you want to do?',
    whatDoYouWantSubtitle: 'Choose a service to discover verified neighborhood shops.',
    
    // Actions
    orderActionTitle: 'Order something',
    orderActionSubtitle: 'Daily provisions, groceries, hot food, fresh bakery & medicines',
    appointmentActionTitle: 'Book an appointment',
    appointmentActionSubtitle: 'Salons, parlours, doctors & clinics without waiting',
    serviceActionTitle: 'Get a service',
    serviceActionSubtitle: 'Tailoring, appliance repair, mechanics & laundry services',
    comingSoonBadge: 'Phase 3 • Coming Soon',
    
    // Shop Types
    grocery: 'Grocery & Provision',
    bakery: 'Bakery & Sweets',
    restaurant: 'Restaurant & Eatery',
    pharmacy: 'Pharmacy & Medicals',
    stationery: 'Stationery & Books',
    
    // Shop & Products
    openNow: 'Open Now',
    closed: 'Closed',
    deliveryAvailable: 'Delivery Available',
    pickupOnly: 'Counter Pickup',
    inStock: 'In Stock',
    outOfStock: 'Out of Stock',
    addToCart: 'Add',
    
    // Cart
    cartTitle: 'Your Cart',
    items: 'items',
    emptyCartTitle: 'Your cart is empty',
    emptyCartSubtitle: 'Explore neighborhood shops and add essentials to get started.',
    orderNotesPlaceholder: 'Special instructions (e.g. deliver fresh, pack separately)...',
    subtotal: 'Item Total',
    total: 'Total Amount',
    submitRequest: 'Send Request to Shop',
    submitNote: 'You pay the merchant directly upon pickup or delivery.',
    
    // Request Statuses (Human-Readable)
    status_REQUESTED: 'Request Sent to Shop',
    status_ACCEPTED: 'Shop Accepted Your Order',
    status_PREPARING: 'Preparing Your Order',
    status_READY: 'Ready for Pickup',
    status_COMPLETED: 'Order Completed',
    status_DELAYED: 'Order Delayed',
    status_CANCELLED: 'Request Cancelled',
    status_REJECTED: 'Shop Unable to Fulfill',
    
    // Request Detail
    requestReceivedMsg: 'The shop has received your request and will review item availability.',
    readyForPickupMsg: 'Your order is packed and ready. You can visit the shop to collect it.',
    
    // Common
    back: 'Back',
    viewCart: 'View Cart',
    trackStatus: 'Track Live Status',
    requestHistory: 'Request History',
    home: 'Home',
    shops: 'Shops',
    requests: 'Requests',
    account: 'Account',
    availableCatalogue: 'Available Catalogue',
    reviewRequest: 'Review Request',
  },
  ta: {
    brand: 'வாங்கோ',
    tagline: 'உங்கள் பகுதி கடைகள், உங்கள் விரல் நுனியில்',
    location: 'இடம்',
    changeLocation: 'இடத்தை மாற்றுக',
    whatDoYouWant: 'நீங்கள் என்ன செய்ய விரும்புகிறீர்கள்?',
    whatDoYouWantSubtitle: 'உங்கள் தேவையைத் தேர்ந்தெடுத்து அருகில் உள்ள கடைகளைக் கண்டறியுங்கள்.',
    
    // Actions
    orderActionTitle: 'பொருட்கள் வாங்க',
    orderActionSubtitle: 'மளிகை பொருட்கள், பேக்கரி, உணவகம் & மருந்துகள்',
    appointmentActionTitle: 'முன்பதிவு செய்ய',
    appointmentActionSubtitle: 'சலூன், அழகு நிலையம் மற்றும் கிளினிக்',
    serviceActionTitle: 'சேவை பெற',
    serviceActionSubtitle: 'தையல், மெக்கானிக், எலக்ட்ரானிக்ஸ் பழுது பார்த்தல்',
    comingSoonBadge: 'அடுத்த கட்டத்தில் • விரைவில்',
    
    // Shop Types
    grocery: 'மளிகைக் கடை',
    bakery: 'பேக்கரி & இனிப்புகள்',
    restaurant: 'உணவகம்',
    pharmacy: 'மருந்தகம்',
    stationery: 'புத்தகங்கள் & ஸ்டேஷனரி',
    
    // Shop & Products
    openNow: 'திறந்துள்ளது',
    closed: 'மூடப்பட்டுள்ளது',
    deliveryAvailable: 'டெலிவரி உண்டு',
    pickupOnly: 'நேரில் பெறலாம்',
    inStock: 'இருப்பில் உள்ளது',
    outOfStock: 'இருப்பில் இல்லை',
    addToCart: 'சேர்க்க',
    
    // Cart
    cartTitle: 'உங்கள் கூடை',
    items: 'பொருட்கள்',
    emptyCartTitle: 'கூடை காலியாக உள்ளது',
    emptyCartSubtitle: 'பொருட்களைச் சேர்க்க கடைகளைத் தேர்வு செய்யுங்கள்.',
    orderNotesPlaceholder: 'குறிப்புகள் (எ.கா. நல்ல காய்கறிகளாகத் தரவும்)...',
    subtotal: 'பொருட்களின் விலை',
    total: 'மொத்தத் தொகை',
    submitRequest: 'கடைக்கு கோரிக்கை அனுப்பு',
    submitNote: 'பொருட்களைப் பெறும்போது கடைக்காரரிடம் நேரடியாக பணம் செலுத்தலாம்.',
    
    // Request Statuses
    status_REQUESTED: 'கோரிக்கை கடைக்கு அனுப்பப்பட்டது',
    status_ACCEPTED: 'கடைக்காரர் ஏற்றுக்கொண்டார்',
    status_PREPARING: 'பொருட்கள் தயார் செய்யப்படுகின்றன',
    status_READY: 'பெற தயாராக உள்ளது',
    status_COMPLETED: 'முழுமை அடைந்தது',
    status_DELAYED: 'தாமதமாகிறது',
    status_CANCELLED: 'ரத்து செய்யப்பட்டது',
    status_REJECTED: 'ஏற்க இயலவில்லை',
    
    // Request Detail
    requestReceivedMsg: 'உங்கள் கோரிக்கை கடைக்குச் சென்றுள்ளது. விரைவில் சரிபார்ப்பார்கள்.',
    readyForPickupMsg: 'உங்கள் பொருட்கள் தயாராக உள்ளன. நேரில் சென்று பெற்றுக்கொள்ளலாம்.',
    
    // Common
    back: 'பின்செல்க',
    viewCart: 'கூடையைப் பார்க்க',
    trackStatus: 'நிலையைக் கண்காணிக்க',
    requestHistory: 'கோரிக்கை வரலாறு',
    home: 'முகப்பு',
    shops: 'கடைகள்',
    requests: 'கோரிக்கைகள்',
    account: 'கணக்கு',
    availableCatalogue: 'கிடைக்கும் பொருட்கள்',
    reviewRequest: 'கோரிக்கையை சரிபார்க்கவும்',
  },
};

export const getTranslation = (lang: Language, key: keyof typeof DICTIONARY['en']): string => {
  return DICTIONARY[lang]?.[key] || DICTIONARY['en'][key] || key;
};
