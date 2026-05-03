import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlerts } from '../components';
import { LogIn, Mail, Lock, Eye, EyeOff, ArrowRight, Wifi, Shield, Zap } from 'lucide-react';
import { signInWithEmail, onAuthStateChange, getSession } from '../supabaseClient';
import './Login.css';

interface LoginFormData {
  email: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlerts();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Verificar sesión existente al cargar
  useEffect(() => {
    const checkSession = async () => {
      const { session } = await getSession();
      if (session) {
        navigate('/dashboard');
      }
    };
    checkSession();

    // Suscribirse a cambios de auth
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const sanitizeInput = (input: string): string => {
    return input.replace(/[<>]/g, '').trim();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: sanitizeInput(value),
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    setAuthError(null);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.email.trim()) {
      newErrors.email = 'El correo electrónico es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Ingrese un correo electrónico válido';
    }
    
    if (!formData.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (formData.password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    setAuthError(null);

    try {
      const { data, error } = await signInWithEmail(formData.email, formData.password);
      
      if (error) {
        // Manejar errores específicos de Supabase
        let errorMessage = 'Credenciales inválidas';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Correo o contraseña incorrectos';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Por favor confirme su correo electrónico antes de iniciar sesión';
        } else if (error.message.includes('Too many requests')) {
          errorMessage = 'Demasiados intentos. Por favor espere unos minutos';
        }
        throw new Error(errorMessage);
      }

      if (data.user) {
        showSuccess(`¡Bienvenido ${data.user.user_metadata?.name || data.user.email}!`);
        navigate('/dashboard');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de autenticación';
      setAuthError(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Logo SVG component - Mikrotik inspired
  const Logo = () => (
    <div className="login-logo-container">
      <svg 
        viewBox="0 0 48 48" 
        className="login-logo-icon"
        aria-label="Conectados Multiservicio"
      >
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B35" />
            <stop offset="50%" stopColor="#F7931E" />
            <stop offset="100%" stopColor="#FFD23F" />
          </linearGradient>
          <linearGradient id="logoGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06FFA5" />
            <stop offset="100%" stopColor="#00D4AA" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="40" height="40" rx="10" fill="url(#logoGradient)" />
        <path d="M14 24 L24 14 L34 24 L24 34 Z" fill="white" opacity="0.9" />
        <circle cx="24" cy="24" r="6" fill="url(#logoGradient2)" />
      </svg>
      <div className="login-logo-text">
        <span className="logo-conectados">CONECTADOS</span>
        <span className="logo-factura">FACTURA+</span>
      </div>
    </div>
  );

  // Feature cards component
  const FeatureCards = () => (
    <div className="feature-cards">
      <div className="feature-card">
        <Wifi className="feature-icon" />
        <span>100% Online</span>
      </div>
      <div className="feature-card">
        <Shield className="feature-icon" />
        <span>Seguro</span>
      </div>
      <div className="feature-card">
        <Zap className="feature-icon" />
        <span>Rápido</span>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-background">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
      </div>
      
      <div className="login-container">
        {/* Logo Section */}
        <div className="login-branding">
          <Logo />
          <p className="login-tagline">Sistema de Facturación Electrónica</p>
          <FeatureCards />
        </div>

        {/* Login Card */}
        <div className="login-card">
          <div className="login-header">
            <h1>Bienvenido</h1>
            <p>Inicie sesión con su cuenta de correo</p>
          </div>

          {authError && (
            <div className="auth-error-banner">
              <span className="error-icon">⚠️</span>
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                <Mail size={16} />
                Correo Electrónico
              </label>
              <div className="input-wrapper">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="su@email.com"
                  disabled={isLoading}
                  autoComplete="email"
                  className={errors.email ? 'input-error' : ''}
                />
              </div>
              {errors.email && (
                <span className="error-text">{errors.email}</span>
              )}
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                <Lock size={16} />
                Contraseña
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className={errors.password ? 'input-error' : ''}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <span className="error-text">{errors.password}</span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="login-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <span>Iniciar Sesión</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          {/* Help Links */}
          <div className="login-help">
            <a href="#" className="help-link">¿Olvidó su contraseña?</a>
            <span className="divider">|</span>
            <a href="#" className="help-link">Soporte técnico</a>
          </div>
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p>© 2026 Conectados Multiservicio</p>
          <p className="version">v2.1.0 - Powered by Supabase</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
