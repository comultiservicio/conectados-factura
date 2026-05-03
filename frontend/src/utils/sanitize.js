/**
 * Utilidades de sanitización para prevenir XSS e inyección
 * @module utils/sanitize
 */

/**
 * Escapa caracteres HTML especiales para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return text.replace(/[&<>"'/]/g, char => htmlEscapes[char]);
}

/**
 * Elimina todas las etiquetas HTML
 * @param {string} html - Texto con HTML
 * @returns {string} Texto sin HTML
 */
export function stripHtml(html) {
  if (typeof html !== 'string') return html;
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Sanitiza un string para prevenir SQL injection básica
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizado
 */
export function sanitizeSql(str) {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/[;\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '')
    .replace(/\/bin\/bash/gi, '')
    .replace(/\/bin\/sh/gi, '');
}

/**
 * Valida y sanitiza un email
 * @param {string} email - Email a validar
 * @returns {string|null} Email sanitizado o null si es inválido
 */
export function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(sanitized) ? sanitized : null;
}

/**
 * Sanitiza un número de teléfono
 * @param {string} phone - Teléfono a sanitizar
 * @returns {string} Teléfono con solo dígitos
 */
export function sanitizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

/**
 * Sanitiza un CUIT/CUIL (Argentina)
 * @param {string} cuit - CUIT a sanitizar
 * @returns {string} CUIT con formato 00-00000000-0
 */
export function sanitizeCUIT(cuit) {
  if (typeof cuit !== 'string') return '';
  
  const digits = cuit.replace(/\D/g, '');
  
  if (digits.length !== 11) return digits;
  
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

/**
 * Sanitiza un objeto completo recursivamente
 * @param {Object} obj - Objeto a sanitizar
 * @param {Array<string>} fields - Campos a sanitizar (si null, todos)
 * @returns {Object} Objeto sanitizado
 */
export function sanitizeObject(obj, fields = null) {
  if (obj === null || typeof obj !== 'object') {
    return sanitizeValue(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, fields));
  }
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Sanitizar la clave también
    const cleanKey = sanitizeValue(key);
    
    // Si se especificaron campos, solo sanitizar esos
    if (fields && !fields.includes(key)) {
      sanitized[cleanKey] = value;
    } else {
      sanitized[cleanKey] = sanitizeObject(value, fields);
    }
  }
  
  return sanitized;
}

/**
 * Sanitiza un valor individual
 * @param {*} value - Valor a sanitizar
 * @returns {*} Valor sanitizado
 */
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  return value;
}

/**
 * Validación y sanitización de inputs de formularios
 */
export const FormSanitizers = {
  /**
   * Campo de texto general
   */
  text(value, maxLength = 255) {
    if (typeof value !== 'string') return '';
    return escapeHtml(value.trim()).slice(0, maxLength);
  },

  /**
   * Campo numérico
   */
  number(value, min = null, max = null) {
    const num = parseFloat(value);
    if (isNaN(num)) return 0;
    
    if (min !== null && num < min) return min;
    if (max !== null && num > max) return max;
    
    return num;
  },

  /**
   * Campo de email
   */
  email(value) {
    return sanitizeEmail(value);
  },

  /**
   * Campo de teléfono
   */
  phone(value) {
    const digits = sanitizePhone(value);
    return digits.slice(0, 15); // Máximo 15 dígitos
  },

  /**
   * Campo de CUIT
   */
  cuit(value) {
    return sanitizeCUIT(value);
  },

  /**
   * Campo de búsqueda
   */
  search(value) {
    if (typeof value !== 'string') return '';
    return escapeHtml(value.trim()).slice(0, 100);
  },

  /**
   * Campo de URL
   */
  url(value) {
    if (typeof value !== 'string') return '';
    
    try {
      const url = new URL(value);
      // Solo permitir http y https
      if (!['http:', 'https:'].includes(url.protocol)) {
        return '';
      }
      return url.toString();
    } catch {
      return '';
    }
  },

  /**
   * Campo de descripción/texto largo
   */
  textarea(value, maxLength = 2000) {
    if (typeof value !== 'string') return '';
    return escapeHtml(value.trim()).slice(0, maxLength);
  }
};

/**
 * Hook de React para sanitizar inputs
 * @example
 * const { sanitizeInput, sanitizeForm } = useSanitizer();
 * const cleanValue = sanitizeInput('text', dirtyValue);
 */
export function useSanitizer() {
  const sanitizeInput = (type, value, ...options) => {
    const sanitizer = FormSanitizers[type];
    if (sanitizer) {
      return sanitizer(value, ...options);
    }
    return FormSanitizers.text(value);
  };

  const sanitizeForm = (formData, schema) => {
    const sanitized = {};
    
    for (const [field, config] of Object.entries(schema)) {
      const value = formData[field];
      const { type, options = [] } = config;
      sanitized[field] = sanitizeInput(type, value, ...options);
    }
    
    return sanitized;
  };

  return {
    sanitizeInput,
    sanitizeForm,
    escapeHtml,
    stripHtml,
    sanitizeObject
  };
}

/**
 * Middleware para sanitizar requests en Express (si se usa en backend)
 */
export function sanitizeRequest(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * Detecta potenciales ataques XSS en string
 * @param {string} str - String a analizar
 * @returns {boolean} True si detecta potencial XSS
 */
export function detectXSS(str) {
  if (typeof str !== 'string') return false;
  
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick, onload, etc
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /data:text\/html/i
  ];
  
  return xssPatterns.some(pattern => pattern.test(str));
}

/**
 * Detecta potenciales SQL injection
 * @param {string} str - String a analizar
 * @returns {boolean} True si detecta potencial SQL injection
 */
export function detectSQLInjection(str) {
  if (typeof str !== 'string') return false;
  
  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
    /UNION\s+SELECT/i,
    /INSERT\s+INTO/i,
    /DELETE\s+FROM/i,
    /DROP\s+TABLE/i
  ];
  
  return sqlPatterns.some(pattern => pattern.test(str));
}

export default {
  escapeHtml,
  stripHtml,
  sanitizeSql,
  sanitizeEmail,
  sanitizePhone,
  sanitizeCUIT,
  sanitizeObject,
  FormSanitizers,
  useSanitizer,
  detectXSS,
  detectSQLInjection
};
