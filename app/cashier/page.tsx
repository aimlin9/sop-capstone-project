"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import { Search, Scan, ShoppingCart, CreditCard, Trash2, Plus, Minus, LogOut, User, CheckCircle, Clock, Banknote, Smartphone } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ThemeToggle } from '@/components/theme-toggle';
import { useHardwareScanner } from '@/components/hooks/useHardwareScanner';

const ReceiptDownloader = dynamic(() => import("./ReceiptDownloader"), { ssr: false });
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  barcode: string;
  category: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface Sale {
  id: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info';
}

export default function CashierPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mobile">("cash");
  const [completedSaleData, setCompletedSaleData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const previousSalesRef = useRef<Sale[]>([]);
  const { data: session, isPending } = useSession();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/products");
        if (res.ok) {
          const data = await res.json();
          setProducts(data);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    const id = `${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  useEffect(() => {
    if (!session) return;
    const fetchSales = async () => {
      try {
        const res = await fetch('/api/sales');
        if (res.ok) {
          const data: Sale[] = await res.json();
          const todaySales = data.filter(s => {
            const saleDate = new Date(s.createdAt).toDateString();
            return saleDate === new Date().toDateString();
          });
          const prev = previousSalesRef.current;
          if (prev.length > 0) {
            todaySales.forEach(sale => {
              const prevSale = prev.find(p => p.id === sale.id);
              if (prevSale && prevSale.paymentStatus === 'pending' && sale.paymentStatus === 'paid') {
                showToast(`💳 Payment confirmed! GH₵ ${sale.totalAmount.toFixed(2)} via ${sale.paymentMethod.toUpperCase()}`, 'success');
              }
            });
          }
          previousSalesRef.current = todaySales;
          setRecentSales(todaySales);
        }
      } catch (error) {
        console.error('Error fetching sales:', error);
      }
    };
    fetchSales();
    const interval = setInterval(fetchSales, 5000);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!pendingReference) return;
    const pollVerify = async () => {
      try {
        const res = await fetch(`/api/paystack/verify/${pendingReference}`);
        if (res.ok) {
          const data = await res.json();
          if (data.verified && data.status === 'paid') {
            setPendingReference(null);
            showToast(`💳 Payment confirmed! Sale recorded successfully.`, 'success');
            setCompletedSaleData((prev: any) => prev ? { ...prev, paymentVerified: true } : prev);
            const productsRes = await fetch('/api/products');
            if (productsRes.ok) setProducts(await productsRes.json());
          }
        }
      } catch (error) {
        console.error('Error verifying payment:', error);
      }
    };
    const interval = setInterval(pollVerify, 5000);
    return () => clearInterval(interval);
  }, [pendingReference]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) { alert("Product out of stock"); return; }
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      if (existingItem.quantity < product.quantity) {
        setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        alert("Not enough stock available");
      }
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const handleBarcodeValue = useCallback((code: string) => {
    const product = products.find(p => p.barcode === code);
    if (product) {
      addToCart(product);
      showToast(`✅ ${product.name} added to cart`, 'success');
    } else {
      showToast(`❌ Product not found: ${code}`, 'info');
    }
  }, [products]);

  useHardwareScanner(handleBarcodeValue);

  const handleBarcodeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    handleBarcodeValue(barcode.trim());
    setBarcode("");
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return null as any;
        if (newQuantity > item.product.quantity) { alert("Not enough stock available"); return item; }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(Boolean) as CartItem[]);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const tax = subtotal * 0.125;
  const total = subtotal + tax;

  const handleCheckout = () => {
    if (cart.length > 0) { setCompletedSaleData(null); setShowPaymentModal(true); }
  };

  const handlePaymentComplete = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const isCash = paymentMethod === 'cash';
      if (isCash) {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map(item => ({ productId: item.product.id, quantity: item.quantity, price: item.product.price })),
            subtotal, tax, total, paymentMethod: 'cash', paymentStatus: 'paid',
          }),
        });
        if (!res.ok) { alert('Failed to record sale. Please try again.'); return; }
        setCompletedSaleData({ items: [...cart], subtotal, tax, total, paymentMethod: 'cash', paystackUrl: null, date: new Date().toLocaleString() });
        setCart([]);
        const productsRes = await fetch('/api/products');
        if (productsRes.ok) setProducts(await productsRes.json());
      } else {
        const paystackRes = await fetch('/api/paystack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: total,
            email: (session?.user as any)?.email || 'customer@SnapSell.com',
            saleReference: `sale_${Date.now()}`,
            items: cart.map(item => ({ productId: item.product.id, quantity: item.quantity, price: item.product.price })),
            userId: (session?.user as any)?.id,
            subtotal, tax, paymentMethod,
          }),
        });
        if (!paystackRes.ok) { alert('Failed to generate payment link. Please try again.'); return; }
        const paystackData = await paystackRes.json();
        setPendingReference(paystackData.reference);
        setCompletedSaleData({ items: [...cart], subtotal, tax, total, paymentMethod, paystackUrl: paystackData.authorization_url, paymentVerified: false, date: new Date().toLocaleString() });
        setCart([]);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Error processing payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ fetchOptions: { onSuccess: () => router.push("/") } });
  };

  if (isPending || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
            <ShoppingCart className="w-7 h-7 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const cashierName = (session?.user as any)?.name || 'Cashier';

  return (
    <div className="h-screen flex flex-col bg-background">

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-500 text-white border-green-600'
              : 'bg-card text-foreground border-border'
          }`}>
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">SnapSell POS</h1>
            <p className="text-xs text-muted-foreground">Cashier Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-medium">
            <User className="w-3.5 h-3.5" />
            <span>{cashierName}</span>
          </div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Products */}
        <div className="flex-1 flex flex-col p-5 overflow-hidden gap-4">

          {/* Search and Barcode */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products by name or category..."
                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
              />
            </div>
            <form onSubmit={handleBarcodeSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or enter barcode..."
                  className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                />
              </div>
              <button type="submit" className="px-4 py-2.5 bg-secondary hover:bg-secondary/80 rounded-xl text-sm font-medium transition-colors">
                Add
              </button>
              <BarcodeScanner
                onScan={(code) => handleBarcodeValue(code)}
                buttonVariant="icon"
                buttonClassName="px-3 py-2.5 bg-secondary hover:bg-secondary/80 rounded-xl"
              />
            </form>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground text-sm">Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
                  <ShoppingCart className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">No products found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={product.quantity <= 0}
                    className="group bg-card border border-border rounded-xl p-4 hover:border-primary hover:shadow-md transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
                  >
                    {product.quantity <= 5 && product.quantity > 0 && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-orange-400 rounded-full" title="Low stock" />
                    )}
                    {product.quantity <= 0 && (
                      <div className="absolute top-2 right-2 text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">OUT</div>
                    )}
                    <div className="mb-3">
                      <span className="text-[10px] font-semibold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {product.category}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm leading-tight mb-1 group-hover:text-primary transition-colors line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between mt-3">
                      <p className="font-bold text-primary text-base">GH₵ {product.price.toFixed(2)}</p>
                      <p className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        product.quantity <= 5
                          ? 'bg-orange-500/10 text-orange-500'
                          : 'bg-green-500/10 text-green-600 dark:text-green-400'
                      }`}>
                        {product.quantity} left
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transaction History Button */}
          <button
            onClick={() => router.push('/cashier/transactions')}
            className="flex items-center justify-between px-4 py-3 bg-card border border-border hover:border-primary rounded-xl transition-all group shrink-0"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm">Transaction History</h3>
                <p className="text-xs text-muted-foreground">View today's sales & status</p>
              </div>
            </div>
            <span className="text-muted-foreground group-hover:text-primary transition-colors text-lg">→</span>
          </button>
        </div>

        {/* Right Panel - Cart */}
        <div className="w-96 bg-card border-l border-border flex flex-col">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-bold">Current Order</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{cart.length} item(s) in cart</p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors font-medium"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Cart is empty</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Click a product to add it here</p>
                </div>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.product.id} className="bg-background border border-border rounded-xl p-3 group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 mr-2">
                      <h4 className="font-semibold text-sm truncate">{item.product.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">GH₵ {item.product.price.toFixed(2)} each</p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 p-1 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-background rounded-md transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-6 h-6 flex items-center justify-center hover:bg-background rounded-md transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="font-bold text-sm">GH₵ {(item.product.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>GH₵ {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (12.5%)</span>
                <span>GH₵ {tax.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="font-bold">Total</span>
              <span className="font-bold text-primary text-lg">GH₵ {total.toFixed(2)}</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              <span>{cart.length === 0 ? 'Add items to checkout' : `Checkout · GH₵ ${total.toFixed(2)}`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
            {!completedSaleData ? (
              <>
                <div className="px-6 py-5 border-b border-border">
                  <h3 className="text-xl font-bold">Select Payment Method</h3>
                  <p className="text-sm text-muted-foreground mt-1">How will the customer pay?</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'cash', label: 'Cash', icon: Banknote },
                      { value: 'card', label: 'Card', icon: CreditCard },
                      { value: 'mobile', label: 'MoMo', icon: Smartphone },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setPaymentMethod(value as any)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          paymentMethod === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-xs font-semibold">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="bg-muted/50 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Total Amount</p>
                    <p className="text-4xl font-black text-primary">GH₵ {total.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">incl. 12.5% tax</p>
                  </div>

                  {paymentMethod !== 'cash' && (
                    <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-600 dark:text-blue-400">
                      <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>A QR code will appear on screen for the customer to scan and pay.</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="flex-1 py-2.5 px-4 border border-border rounded-xl hover:bg-muted/50 transition-colors font-medium text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePaymentComplete}
                      disabled={isProcessing}
                      className="flex-1 py-2.5 px-4 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? 'Processing...' : 'Complete Payment'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center space-y-4">
                {completedSaleData.paymentMethod === 'cash' ? (
                  <>
                    <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center mx-auto border border-green-500/20">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Payment Complete!</h3>
                      <p className="text-sm text-muted-foreground">Transaction recorded successfully.</p>
                    </div>
                  </>
                ) : completedSaleData.paymentVerified ? (
                  <>
                    <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center mx-auto border border-green-500/20">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Payment Confirmed!</h3>
                      <p className="text-sm text-muted-foreground">The payment has been verified and recorded.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20 relative">
                      <Clock className="w-8 h-8" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Awaiting Payment</h3>
                      <p className="text-sm text-muted-foreground">Show this QR code to the customer to scan and pay.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1 animate-pulse">Checking payment status...</p>
                    </div>
                    {completedSaleData.paystackUrl && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(completedSaleData.paystackUrl)}`}
                          alt="Payment QR Code"
                          className="w-44 h-44 rounded-xl border border-border shadow-sm"
                        />
                        
                        <a
                          href={completedSaleData.paystackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline underline-offset-2 truncate max-w-xs"
                        >
                          {completedSaleData.paystackUrl}
                        </a>
                      </div>
                    )}
                  </>
                )}
                
                <ReceiptDownloader
                  completedSaleData={completedSaleData}
                  onDone={() => setShowPaymentModal(false)}
                  paymentVerified={
                    completedSaleData.paymentMethod === 'cash' || completedSaleData.paymentVerified
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

