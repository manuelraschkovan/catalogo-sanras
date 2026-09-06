import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Search, Upload, Package, X, Download, ShoppingCart, Plus, Minus, Trash2, Send, LogOut, Truck, AlertCircle, Users, Settings, FileSpreadsheet, Check, Pencil, Home, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// Paleta de colores Distribuidora San-Ras SA
const COLORS = {
  azul: '#1e2a6e',
  azulOscuro: '#15205a',
  azulClaro: '#2d3a8a',
  gris: '#9ca3af',
  grisClaro: '#e5e7eb',
};

// URL del logo desde Cloudinary
const LOGO_URL = 'https://res.cloudinary.com/dijfepcwx/image/upload/f_auto,q_auto/LOGO_DISTRIBUIDORA_i3ljp2.jpg';

// ============================================================
//  BACKEND SAN-RAS (conexión con Flexxus)
// ============================================================
//  Esta es la dirección del backend que lee los productos y precios
//  desde Flexxus. Cuando cambie el túnel, actualizá SOLO esta línea.
//  (La de trycloudflare es temporal; con el dominio fijo se cambia acá.)
const BACKEND_URL = 'https://backend.distribuidorasanras.com';

// Convierte un producto que viene del backend al formato que usa el catálogo.
// El backend manda: { codigo, descripcion, marca, precio, stock, sinStock, porBulto }
// Ojo: el backend ya manda SOLO el precio de la lista del cliente (más seguro),
// así que lo guardamos en las 5 posiciones para no romper el resto del código.
const convertirProductoBackend = (p, indice) => {
  const precio = Number(p.precio) || 0;
  // Para categorizar usamos la descripción CON prefijos (original);
  // para mostrar, la limpia (sin AFJ, BLT, etc.).
  const descParaCategoria = p.descripcionOriginal || p.descripcion || '';
  return {
    id: indice + 1,
    nombre: p.descripcion || '',
    categoria: detectarCategoriaEspecial(descParaCategoria, p.marca) || 'Otros',
    codigo: p.codigo || '',
    marca: p.marca || '',
    imagen: obtenerUrlImagen(p.codigo, p.descripcion),
    porBulto: !!p.soloBulto,       // con BLT = solo bulto cerrado
    unidadesPorBulto: 1,           // el precio de Flexxus ya es el de venta
    stock: Number(p.stock) || 0,
    sinStock: !!p.sinStock,
    soloBulto: !!p.soloBulto,
    empaque: p.empaque || null,    // desglose calculado por el backend
    sinPrecio: !!p.sinPrecio,      // modo previsualización (sin precios)
    // Mismo precio en las 5 posiciones: el backend ya filtró por la lista del cliente
    precios: { 1: precio, 2: precio, 3: precio, 4: precio, 5: precio },
  };
};

// Configuración de Cloudinary para fotos de productos
const CLOUDINARY_CLOUD = 'dijfepcwx';
// Las fotos se buscan por código directamente.
// El public_id de cada foto en Cloudinary debe ser el código del producto (ej: BG001, BG002).
// La carpeta visual donde estén guardadas en Cloudinary no afecta al catálogo.

// "Sello" de caché basado en el día: cambia automáticamente cada jornada, de modo que
// si reemplazás o borrás una foto, al día siguiente el navegador la recarga sí o sí.
// Como es parte de la RUTA (no un ?query), no interfiere con las transformaciones.
const SELLO_CACHE = (() => {
  const hoy = new Date();
  return `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
})();

// Genera la URL de la imagen del producto a partir del código
const obtenerUrlImagen = (codigo, nombre) => {
  if (!codigo) return `https://via.placeholder.com/400/1e2a6e/ffffff?text=${encodeURIComponent((nombre || '').substring(0, 20))}`;
  // Transformaciones (foto completa sin recortar, centrada en cuadro con fondo blanco):
  //   w_400,h_400  -> cuadro cuadrado
  //   c_pad        -> mete la foto ENTERA sin cortar nada
  //   b_white      -> rellena el espacio sobrante con fondo blanco
  //   q_auto,f_auto -> calidad y formato óptimos
  // El sello de caché va como una transformación más (no como ?query) para no romper la transformación.
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/w_400,h_400,c_pad,b_white,q_auto,f_auto/v${SELLO_CACHE}/${codigo}`;
};

// Genera el nombre de archivo del logo a partir de un texto (marca o sub-marca)
// "ALF GULA" -> "marca_alf_gula"
const slugLogo = (texto) => {
  if (!texto) return null;
  return 'marca_' + String(texto)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[´`'']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

// Sub-marcas de Arcor: si la marca es ARCOR/ARCOR 2 y la descripción menciona
// una de estas, usamos el logo de la sub-marca en vez del de Arcor.
// Cada entrada: [regex que busca en la descripción, nombre de archivo del logo]
const SUBMARCAS_ARCOR = [
  [/\bALKA\b/i,   'marca_alka'],
  [/\bMISKY\b/i,  'marca_misky'],
  [/\bSUGUS\b/i,  'marca_sugus'],
  [/\bLIA\b|\bLÍA\b/i, 'marca_lia'],   // Lía con y sin acento
  [/\bHAMLET\b/i, 'marca_hamlet'],
];

// Decide el nombre de archivo del logo para un producto (marca + descripción).
const nombreLogoProducto = (marca, descripcion) => {
  const m = String(marca || '').toUpperCase();
  const desc = String(descripcion || '');
  // Si es Arcor, revisar sub-marcas
  if (m === 'ARCOR' || m === 'ARCOR 2' || m.startsWith('ARCOR')) {
    for (const [re, archivo] of SUBMARCAS_ARCOR) {
      if (re.test(desc)) return archivo;
    }
  }
  return slugLogo(marca);
};

// URL del logo en Cloudinary.
//  e_trim: recorta bordes sobrantes de color uniforme (arregla Terepín, etc.)
//  c_pad + b_transparent: mete el logo entero en un cuadro con fondo transparente
//  Los chicos se ven mejor porque el trim saca el espacio vacío alrededor.
const urlLogo = (nombreArchivo) => {
  if (!nombreArchivo) return null;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/e_trim/w_240,h_240,c_pad,b_transparent,q_auto,f_auto/v${SELLO_CACHE}/${nombreArchivo}`;
};

// Para lugares donde solo hay marca (desplegable, barra de carga)
const obtenerUrlLogoMarca = (marca) => urlLogo(slugLogo(marca));
// Para la tarjeta de producto (considera sub-marcas de Arcor)
const obtenerUrlLogoProducto = (marca, descripcion) => urlLogo(nombreLogoProducto(marca, descripcion));

// Detectar categoría especial según palabras clave en la descripción
const detectarCategoriaEspecial = (descripcion, marca) => {
  const desc = (descripcion || '').toUpperCase();

  // Categorías por PREFIJO en la descripción (los pone Manuel en Flexxus).
  // El orden importa: la primera que coincida gana.
  // Se busca el código como palabra separada (con límites), para evitar
  // que un código matchee dentro de otra palabra.
  const reglas = [
    { codigo: 'AFJ',    categoria: 'Alfajores' },
    { codigo: 'FIDEO',  categoria: 'Fideos' },
    { codigo: 'CHOC',   categoria: 'Chocolates' },
    { codigo: 'BMB',    categoria: 'Bombones' },
    { codigo: 'CRM',    categoria: 'Caramelos' },
    { codigo: 'CTN',    categoria: 'Chupetines' },
    { codigo: 'TRTA',   categoria: 'Tortas' },
    { codigo: 'FSTA',   categoria: 'Fiesta 🎅' },
    { codigo: 'SNK',    categoria: 'Snacks' },
    { codigo: 'CLQ',    categoria: 'Apto celíacos sin TACC' },
    { codigo: 'GLSN',   categoria: 'Golosinas' },
    { codigo: 'GRANEL', categoria: 'Granel' },
    { codigo: 'PLLS',   categoria: 'Pastillas' },
    { codigo: 'TST',    categoria: 'Tostadas' },
    { codigo: 'MRG',    categoria: 'Merengues' },
    { codigo: 'CRLS',   categoria: 'Cereales' },
    { codigo: 'DTC',    categoria: 'Dietéticas' },
    { codigo: 'OTRO',   categoria: 'Almacen' },
  ];

  for (const regla of reglas) {
    // \\b = límite de palabra, para que el código esté aislado
    const patron = new RegExp('\\b' + regla.codigo + '\\b');
    if (patron.test(desc)) return regla.categoria;
  }
  return 'Otros';
};

// Muestra el logo de la marca si existe en Cloudinary; si no, muestra el texto.
// tamaño: 'chico' (desplegable) | 'tarjeta' (card de producto)
// descripcion: opcional, para detectar sub-marcas de Arcor (Alka, Misky, etc.)
function LogoMarca({ marca, descripcion, tamano = 'tarjeta', fallbackTexto = true }) {
  const [falla, setFalla] = useState(false);
  const url = descripcion != null
    ? obtenerUrlLogoProducto(marca, descripcion)
    : obtenerUrlLogoMarca(marca);

  // Si no hay marca o el logo falló, mostramos el texto (o nada)
  if (!marca || !url || falla) {
    if (!fallbackTexto) return null;
    const cls = tamano === 'chico'
      ? 'text-sm text-gray-700'
      : 'text-xs font-bold uppercase tracking-wide';
    const estilo = tamano === 'chico' ? {} : { color: COLORS.azul };
    return <span className={cls} style={estilo}>{marca}</span>;
  }

  const altura = tamano === 'chico' ? 26 : 42;
  return (
    <img
      src={url}
      alt={marca}
      title={marca}
      style={{ height: altura, maxWidth: tamano === 'chico' ? 100 : 150, objectFit: 'contain', display: 'block' }}
      onError={() => setFalla(true)}
    />
  );
}

// Componente del logo
function LogoSanRas({ size = 'normal' }) {
  const dimensions = size === 'grande' 
    ? { maxWidth: '280px', maxHeight: '180px', minHeight: '120px' } 
    : { maxWidth: '110px', maxHeight: '60px', minHeight: '40px' };
  return (
    <img 
      src={LOGO_URL} 
      alt="Distribuidora San-Ras SA"
      style={{ ...dimensions, objectFit: 'contain', width: 'auto' }}
    />
  );
}

// Productos de ejemplo
const productosEjemplo = [
  { id: 1, nombre: 'Aceite Girasol 1.5L', categoria: 'Aceites', codigo: 'ACE001', marca: '', imagen: obtenerUrlImagen('ACE001', 'Aceite Girasol 1.5L'), porBulto: true, unidadesPorBulto: 12, precios: { 1: 2650, 2: 2780, 3: 2680, 4: 2950, 5: 2580 } },
  { id: 2, nombre: 'Arroz Largo Fino 1kg', categoria: 'Arroz', codigo: 'ARR001', marca: '', imagen: obtenerUrlImagen('ARR001', 'Arroz Largo Fino 1kg'), porBulto: true, unidadesPorBulto: 10, precios: { 1: 1280, 2: 1350, 3: 1290, 4: 1480, 5: 1240 } },
  { id: 3, nombre: 'Fideos Spaghetti 500g', categoria: 'Fideos', codigo: 'FID001', marca: '', imagen: obtenerUrlImagen('FID001', 'Fideos Spaghetti 500g'), porBulto: false, precios: { 1: 850, 2: 920, 3: 870, 4: 1050, 5: 820 } },
];

const clientesEjemplo = [
  { numero: '1001', clave: '1234', nombre: 'Supermercado Lin', lista: 1, ciudad: 'Bahía Blanca' },
  { numero: '2001', clave: '1234', nombre: 'Kiosco El Sol', lista: 2, ciudad: 'Punta Alta' },
  { numero: '3001', clave: '1234', nombre: 'Hipermercado Norte', lista: 3, ciudad: 'Médanos' },
  { numero: '5001', clave: '1234', nombre: 'Juan Pérez (Revendedor)', lista: 5, ciudad: 'Tornquist' },
];

const NOMBRES_LISTAS = {
  1: 'Lista 1 - Supermercados',
  2: 'Lista 2 - Comercios',
  3: 'Lista 3 - Hipermercados',
  4: 'Lista 4 - Consumidor Final',
  5: 'Lista 5 - Revendedores',
};

const MINIMO_CONSUMIDOR_FINAL = 80000;
const WHATSAPP_DISTRIBUIDORA = '5492915752165';
const TELEFONO_DISTRIBUIDORA_VISIBLE = '291 575-2165';
const ENVIO_WHATSAPP_ACTIVO = false; // Cambiar a true cuando esté listo

// Ciudades habilitadas para envío a domicilio (sin costo)
const CIUDADES_CON_ENVIO = ['Bahía Blanca', 'Punta Alta', 'Médanos'];

// Determina si un cliente puede elegir entre retirar o envío
const puedeElegirEntrega = (cliente) => {
  if (!cliente || cliente.tipo === 'consumidor') return false; // consumidor final siempre retira
  if (cliente.lista === 5) return false; // lista 5 ya tiene flete descontado
  return CIUDADES_CON_ENVIO.includes(cliente.ciudad);
};

// Componente del control de cantidad con flujo: Agregar → Input + Tilde → Lápiz para editar
function ControlCantidad({ producto, modoActual, cantidadActual, onAgregar, onEstablecerCantidad, onQuitar, claveCar }) {
  const [estado, setEstado] = useState('inicial'); // 'inicial' | 'editando' | 'confirmado'
  const [cantidadTemp, setCantidadTemp] = useState('1');
  const inputRef = useRef(null);

  // Si la cantidad cambia desde fuera (ej: desde el carrito), sincronizar
  useEffect(() => {
    if (cantidadActual > 0 && estado === 'inicial') {
      setEstado('confirmado');
    }
    if (cantidadActual === 0 && estado === 'confirmado') {
      setEstado('inicial');
    }
  }, [cantidadActual]);

  const iniciarAgregar = () => {
    setCantidadTemp('1');
    setEstado('editando');
    setTimeout(() => inputRef.current?.focus(), 50);
    setTimeout(() => inputRef.current?.select(), 80);
  };

  const confirmar = () => {
    const cant = parseInt(cantidadTemp) || 0;
    if (cant <= 0) {
      setEstado('inicial');
      onEstablecerCantidad(producto, modoActual, 0);
      return;
    }
    onEstablecerCantidad(producto, modoActual, cant);
    setEstado('confirmado');
  };

  const editarDeNuevo = () => {
    setCantidadTemp(String(cantidadActual));
    setEstado('editando');
    setTimeout(() => inputRef.current?.focus(), 50);
    setTimeout(() => inputRef.current?.select(), 80);
  };

  const eliminar = () => {
    onEstablecerCantidad(producto, modoActual, 0);
    setEstado('inicial');
  };

  if (estado === 'inicial') {
    return (
      <button
        onClick={iniciarAgregar}
        className="w-full text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-colors"
        style={{ backgroundColor: COLORS.azul }}
      >
        <Plus className="w-4 h-4" />Agregar
      </button>
    );
  }

  if (estado === 'editando') {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="1"
          value={cantidadTemp}
          onChange={(e) => setCantidadTemp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmar();
            if (e.key === 'Escape') {
              if (cantidadActual > 0) setEstado('confirmado');
              else setEstado('inicial');
            }
          }}
          className="flex-1 min-w-0 font-black text-center border-2 rounded-lg py-1.5 text-sm focus:outline-none"
          style={{ color: COLORS.azul, borderColor: COLORS.azul }}
          placeholder="Cant."
        />
        <button
          onClick={confirmar}
          className="text-white p-1.5 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: '#16a34a' }}
          title="Confirmar"
        >
          <Check className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // estado === 'confirmado'
  return (
    <div className="flex items-center gap-1">
      <div
        className="flex-1 min-w-0 font-black text-center py-1.5 text-sm rounded-lg flex items-center justify-center gap-1"
        style={{ backgroundColor: COLORS.grisClaro, color: COLORS.azul }}
      >
        <Check className="w-4 h-4" style={{ color: '#16a34a' }} />
        {cantidadActual} {modoActual === 'bulto' ? 'B' : 'U'}
      </div>
      <button
        onClick={editarDeNuevo}
        className="p-1.5 rounded-lg flex items-center justify-center text-white"
        style={{ backgroundColor: COLORS.azul }}
        title="Editar cantidad"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={eliminar}
        className="p-1.5 rounded-lg flex items-center justify-center text-white"
        style={{ backgroundColor: '#dc2626' }}
        title="Quitar del pedido"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============ PANTALLA DE LOGIN ============
const PROVINCIAS_AR = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
];

function PantallaLogin({ onLogin }) {
  // modo: 'inicio' | 'login' | 'registro' | 'recuperar'
  const [modo, setModo] = useState('inicio');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [cuit, setCuit] = useState('');
  const [password2, setPassword2] = useState('');
  const [direccion, setDireccion] = useState('');
  const [provincia, setProvincia] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const limpiar = () => { setError(''); setPassword(''); setPassword2(''); setCuit(''); setDireccion(''); setProvincia(''); setLocalidad(''); };

  // --- LOGIN (código + contraseña) ---
  const hacerLogin = async () => {
    setError('');
    if (!codigo.trim() || !password) { setError('Completá tu código y contraseña.'); return; }
    setCargando(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoCliente: codigo.trim(), password })
      });
      const data = await r.json();
      if (data.ok) {
        onLogin({ tipo: 'cliente', token: data.token, ...data.cliente });
      } else if (data.motivo === 'no_registrado') {
        setError('Todavía no tenés cuenta. Registrate para crear tu contraseña.');
        setModo('registro');
      } else {
        setError(data.motivo || 'No se pudo ingresar.');
      }
    } catch (e) {
      setError('No se pudo conectar. Revisá tu internet e intentá de nuevo.');
    } finally { setCargando(false); }
  };

  // --- REGISTRO (código + CUIT + dirección + contraseña) ---
  const hacerRegistro = async () => {
    setError('');
    if (!codigo.trim() || !cuit.trim()) { setError('Completá tu código de cliente y CUIT.'); return; }
    if (modo === 'registro') {
      if (!provincia.trim()) { setError('Elegí tu provincia.'); return; }
      if (!localidad.trim()) { setError('Ingresá tu localidad.'); return; }
      if (!direccion.trim()) { setError('Ingresá la dirección de tu comercio.'); return; }
    }
    if (password.length < 4) { setError('La contraseña debe tener al menos 4 caracteres.'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return; }
    setCargando(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/registro`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoCliente: codigo.trim(), cuit: cuit.trim(), password,
          direccion: direccion.trim(), provincia: provincia.trim(), localidad: localidad.trim()
        })
      });
      const data = await r.json();
      if (data.ok) {
        onLogin({ tipo: 'cliente', token: data.token, ...data.cliente });
      } else {
        setError(data.motivo || 'No se pudo registrar.');
      }
    } catch (e) {
      setError('No se pudo conectar. Revisá tu internet e intentá de nuevo.');
    } finally { setCargando(false); }
  };

  // --- RECUPERAR (mismo que registro: código+CUIT y nueva contraseña) ---
  const hacerRecuperar = hacerRegistro;

  const inputCls = "w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${COLORS.azul} 0%, ${COLORS.azulOscuro} 100%)` }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6 flex flex-col items-center">
          <LogoSanRas size="grande" />
        </div>

        {/* INICIO: elegir entre ingresar o previsualizar */}
        {modo === 'inicio' && (
          <div className="space-y-3">
            <p className="text-center text-gray-600 mb-4">¿Cómo querés ingresar?</p>
            <button onClick={() => { limpiar(); setModo('login'); }}
              className="w-full py-4 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: COLORS.azul }}>
              <Users className="w-5 h-5" /> Ingresar con mi cuenta
            </button>
            <button onClick={() => onLogin({ tipo: 'preview', nombre: 'Previsualización', lista: 0 })}
              className="w-full py-4 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-colors hover:bg-gray-50"
              style={{ borderColor: COLORS.azul, color: COLORS.azul }}>
              <ShoppingCart className="w-5 h-5" /> Previsualizar catálogo
            </button>
            <p className="text-xs text-center text-gray-500 mt-2">
              La previsualización muestra los productos sin precios.
            </p>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-gray-700 leading-relaxed">
                <strong style={{ color: COLORS.azul }}>¿Tenés autoservicio, almacén, kiosco o sos revendedor?</strong><br/>
                Si todavía no tenés número de cliente, comunicate al{' '}
                <a href={`https://wa.me/${WHATSAPP_DISTRIBUIDORA}`} target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: COLORS.azul }}>
                  {TELEFONO_DISTRIBUIDORA_VISIBLE}
                </a>{' '}para habilitarlo.
              </p>
            </div>
          </div>
        )}

        {/* LOGIN */}
        {modo === 'login' && (
          <div className="space-y-3">
            <h3 className="text-center font-bold text-gray-700 mb-2">Ingresá con tu cuenta</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de cliente</label>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && hacerLogin()} placeholder="Ej: 82" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && hacerLogin()} placeholder="••••" className={inputCls} />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <button onClick={hacerLogin} disabled={cargando}
              className="w-full py-3 rounded-xl text-white font-bold transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{ backgroundColor: COLORS.azul }}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>

            <div className="flex justify-between text-sm">
              <button onClick={() => { limpiar(); setModo('registro'); }} className="font-semibold hover:underline" style={{ color: COLORS.azul }}>
                Registrarme
              </button>
              <button onClick={() => { limpiar(); setModo('recuperar'); }} className="text-gray-500 hover:underline">
                Olvidé mi contraseña
              </button>
            </div>
            <button onClick={() => { limpiar(); setModo('inicio'); }} className="w-full py-2 text-gray-500 text-sm hover:text-gray-700">← Volver</button>
          </div>
        )}

        {/* REGISTRO y RECUPERAR comparten formulario */}
        {(modo === 'registro' || modo === 'recuperar') && (
          <div className="space-y-3">
            <h3 className="text-center font-bold text-gray-700 mb-1">
              {modo === 'registro' ? 'Crear mi cuenta' : 'Recuperar contraseña'}
            </h3>
            <p className="text-xs text-center text-gray-500 mb-2">
              {modo === 'registro'
                ? 'Validamos tu código y CUIT con la distribuidora.'
                : 'Ingresá tu código y CUIT para crear una nueva contraseña.'}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de cliente</label>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: 82" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CUIT (sin guiones)</label>
              <input type="text" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="Ej: 20954543057" className={inputCls} />
            </div>
            {modo === 'registro' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className={inputCls}>
                  <option value="">Elegí tu provincia…</option>
                  {PROVINCIAS_AR.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {modo === 'registro' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Localidad</label>
                <input type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Ej: Bahía Blanca" className={inputCls} />
              </div>
            )}
            {modo === 'registro' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección de tu comercio</label>
                <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle y número" className={inputCls} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {modo === 'registro' ? 'Creá una contraseña' : 'Nueva contraseña'}
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 4 caracteres" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Repetí la contraseña</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (modo === 'registro' ? hacerRegistro() : hacerRecuperar())} placeholder="••••" className={inputCls} />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <button onClick={modo === 'registro' ? hacerRegistro : hacerRecuperar} disabled={cargando}
              className="w-full py-3 rounded-xl text-white font-bold transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{ backgroundColor: COLORS.azul }}>
              {cargando ? 'Procesando…' : (modo === 'registro' ? 'Crear cuenta' : 'Guardar nueva contraseña')}
            </button>
            <button onClick={() => { limpiar(); setModo('login'); }} className="w-full py-2 text-gray-500 text-sm hover:text-gray-700">← Volver al ingreso</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ PANTALLA DE CARGA (camión: galpón → comercio) ============
function PantallaCarga({ progreso, logoUrl, logosMarcas }) {
  const pct = Math.min(Math.max(progreso, 0), 100);

  const IMG_GALPON   = 'https://res.cloudinary.com/dijfepcwx/image/upload/e_background_removal/v1786811789/Galpon_animado_distribuidora.png';
  const IMG_COMERCIO = 'https://res.cloudinary.com/dijfepcwx/image/upload/e_background_removal/v1786811792/Comercio_animado.png';
  const IMG_CAMION   = 'https://res.cloudinary.com/dijfepcwx/image/upload/v1786823128/Logo_camioneta_no_fon_dp.png';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg, #8fd3f4 0%, #b8e4f7 45%, #dff2fb 100%)'
    }}>
      {/* keyframes de la animación */}
      <style>{`
        @keyframes sr-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes sr-cloud { 0% { transform: translateX(0) } 100% { transform: translateX(40px) } }
        @keyframes sr-dash { to { background-position: -68px 0 } }
        @keyframes sr-fade { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes sr-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      `}</style>

      {/* Sol */}
      <div style={{
        position: 'absolute', top: '8%', right: '14%', width: 70, height: 70, borderRadius: '50%',
        background: 'radial-gradient(circle, #fff3b0 0%, #ffe066 60%, rgba(255,224,102,0) 72%)'
      }} />
      {/* Nubes suaves */}
      <div style={{ position: 'absolute', top: '14%', left: '12%', animation: 'sr-cloud 9s ease-in-out infinite alternate' }}>
        <Nube />
      </div>
      <div style={{ position: 'absolute', top: '24%', left: '62%', transform: 'scale(0.7)', opacity: 0.85, animation: 'sr-cloud 11s ease-in-out infinite alternate' }}>
        <Nube />
      </div>

      {/* Tarjeta central con la escena */}
      <div style={{ animation: 'sr-fade 0.5s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {/* Logo */}
        <img src={logoUrl} alt="Distribuidora San-Ras"
          style={{ width: 138, maxWidth: '48%', borderRadius: 18, marginBottom: 18, boxShadow: '0 10px 34px rgba(10,42,94,0.22)' }} />

        <div style={{ color: '#0a2a5e', fontSize: 19, fontWeight: 800, letterSpacing: 0.2, marginBottom: 30 }}>
          Preparando tu pedido…
        </div>

        {/* Escena */}
        <div style={{ width: 'min(560px, 94vw)', position: 'relative', height: 168 }}>

          {/* Pasto/suelo detrás de la calle */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 96,
            background: 'linear-gradient(180deg, #cdeeb0 0%, #a9df86 100%)', borderRadius: 12
          }} />

          {/* Galpón (origen) — apoyado sobre el pasto */}
          <img src={IMG_GALPON} alt="galpón"
            style={{ position: 'absolute', left: '1%', bottom: 58, width: 118, height: 'auto', zIndex: 3,
                     filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.18))' }} />

          {/* Comercio (destino) */}
          <img src={IMG_COMERCIO} alt="comercio"
            style={{ position: 'absolute', right: '1%', bottom: 58, width: 118, height: 'auto', zIndex: 3,
                     filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.18))' }} />

          {/* La calle */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 52,
            background: 'linear-gradient(180deg, #4a4f57 0%, #33373e 100%)',
            borderTop: '3px solid #2a2d33', borderRadius: '4px 4px 10px 10px', zIndex: 2,
            boxShadow: 'inset 0 6px 12px rgba(0,0,0,0.25)'
          }}>
            {/* Línea discontinua animada */}
            <div style={{
              position: 'absolute', top: '50%', left: 0, right: 0, height: 4, transform: 'translateY(-50%)',
              backgroundImage: 'repeating-linear-gradient(90deg, #ffd54f 0 26px, transparent 26px 42px)',
              backgroundSize: '68px 4px', animation: 'sr-dash 0.7s linear infinite'
            }} />
          </div>

          {/* Camión sobre la calle (con leve rebote). Va del 6% al 78%. */}
          <div style={{
            position: 'absolute', bottom: 30, left: `calc(${6 + pct * 0.72}% - 34px)`, zIndex: 4,
            transition: 'left 0.35s cubic-bezier(.25,.8,.5,1)'
          }}>
            <img src={IMG_CAMION} alt="camión"
              style={{ width: 88, height: 'auto', display: 'block',
                       animation: 'sr-bob 0.6s ease-in-out infinite',
                       filter: 'drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff) drop-shadow(0 5px 5px rgba(0,0,0,0.3))' }} />
          </div>
        </div>

        {/* Barra de progreso */}
        <div style={{ width: 'min(560px, 94vw)', marginTop: 30 }}>
          <div style={{ height: 8, borderRadius: 8, background: 'rgba(10,42,94,0.14)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 8,
              background: 'linear-gradient(90deg, #2f6fd0, #0a2a5e)',
              transition: 'width 0.35s ease-out'
            }} />
          </div>
          <div style={{ textAlign: 'center', color: '#0a2a5e', fontSize: 14, fontWeight: 800, marginTop: 10 }}>
            {Math.round(pct)}%
          </div>
        </div>

        {/* Franja de logos de marcas desfilando */}
        {logosMarcas && logosMarcas.length > 0 && (
          <div style={{ width: 'min(560px, 94vw)', marginTop: 24, overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}>
            <div style={{ display: 'flex', gap: 28, alignItems: 'center', animation: 'sr-marquee 18s linear infinite', width: 'max-content' }}>
              {[...logosMarcas, ...logosMarcas].map((url, i) => (
                <img key={i} src={url} alt="" style={{ height: 44, objectFit: 'contain', opacity: 0.95 }}
                     onError={(e) => { e.target.style.display = 'none'; }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Nubecita decorativa
function Nube() {
  return (
    <div style={{ position: 'relative', width: 70, height: 26 }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 70, height: 18, background: '#fff', borderRadius: 20, opacity: 0.9 }} />
      <div style={{ position: 'absolute', bottom: 8, left: 14, width: 26, height: 26, background: '#fff', borderRadius: '50%', opacity: 0.9 }} />
      <div style={{ position: 'absolute', bottom: 6, left: 34, width: 22, height: 22, background: '#fff', borderRadius: '50%', opacity: 0.9 }} />
    </div>
  );
}

// ============ APP PRINCIPAL ============
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [productos, setProductos] = useState([]);
  const [yaSincronizo, setYaSincronizo] = useState(false);
  const [progresoCarga, setProgresoCarga] = useState(0);
  const [clientes, setClientes] = useState(clientesEjemplo);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [marcasSeleccionadas, setMarcasSeleccionadas] = useState([]); // array de marcas elegidas con tilde
  const [mostrarMenuMarcas, setMostrarMenuMarcas] = useState(false);
  const [busquedaMarca, setBusquedaMarca] = useState('');
  const [mostrarCarga, setMostrarCarga] = useState(false);
  const [mensajeCarga, setMensajeCarga] = useState('');
  const [tipoCargaArchivo, setTipoCargaArchivo] = useState('listas-excel');
  const [carrito, setCarrito] = useState({});
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [pedidoOk, setPedidoOk] = useState(null);       // { numero, total, items }
  const [pedidoError, setPedidoError] = useState('');
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [mostrarAdmin, setMostrarAdmin] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState({});
  const [archivosListas, setArchivosListas] = useState({ listas1a4: null, lista5: null });
  const [procesandoListas, setProcesandoListas] = useState(false);
  const [modalidadEntrega, setModalidadEntrega] = useState('retiro'); // 'retiro' | 'envio'
  const [diaRetiro, setDiaRetiro] = useState('');           // 'YYYY-MM-DD'
  const [observacionesPedido, setObservacionesPedido] = useState('');
  const [feriados, setFeriados] = useState([]);             // ['YYYY-MM-DD', ...]
  const [cargandoBackend, setCargandoBackend] = useState(false);
  const [errorBackend, setErrorBackend] = useState('');
  const fileInputRef = useRef(null);

  // --- Carrito persistente (se guarda por cliente en el navegador) ---
  const claveCarritoGuardado = usuario && usuario.codigo ? `carrito_sanras_${usuario.codigo}` : null;

  // Al entrar un cliente, recuperar su carrito guardado (si hay)
  useEffect(() => {
    if (!claveCarritoGuardado) return;
    try {
      const guardado = window.localStorage.getItem(claveCarritoGuardado);
      if (guardado) {
        const obj = JSON.parse(guardado);
        if (obj && typeof obj === 'object') setCarrito(obj);
      }
    } catch (e) { /* si localStorage no está disponible, seguimos sin recuperar */ }
  }, [claveCarritoGuardado]);

  // Cada vez que cambia el carrito, guardarlo
  useEffect(() => {
    if (!claveCarritoGuardado) return;
    try {
      window.localStorage.setItem(claveCarritoGuardado, JSON.stringify(carrito));
    } catch (e) { /* sin persistencia si falla */ }
  }, [carrito, claveCarritoGuardado]);

  // Cuando el usuario entra, traemos los productos del backend (Flexxus)
  // con el precio de SU lista. Si el backend no responde, quedan los de ejemplo.
  useEffect(() => {
    if (!usuario) return;
    const esPreview = usuario.tipo === 'preview';
    const lista = usuario.lista;
    // En preview no hay lista; en cliente, si no hay lista no cargamos.
    if (!esPreview && !lista) return;

    let cancelado = false;
    setCargandoBackend(true);
    setErrorBackend('');
    setProgresoCarga(10);

    const intervalo = setInterval(() => {
      setProgresoCarga(p => (p < 90 ? p + Math.random() * 8 : p));
    }, 200);

    // preview -> sin lista (backend manda sin precios); cliente -> con su lista
    const url = esPreview ? `${BACKEND_URL}/api/catalogo` : `${BACKEND_URL}/api/catalogo?lista=${lista}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('El servidor respondió ' + r.status);
        return r.json();
      })
      .then(data => {
        if (cancelado) return;
        if (data && data.ok && Array.isArray(data.productos)) {
          const convertidos = data.productos.map(convertirProductoBackend);
          setProductos(convertidos);
          setProgresoCarga(100);
        } else {
          throw new Error('Respuesta inválida del servidor');
        }
      })
      .catch(err => {
        if (cancelado) return;
        setErrorBackend('No se pudieron cargar los productos actualizados. ' + err.message);
        setProgresoCarga(100);
      })
      .finally(() => {
        clearInterval(intervalo);
        if (!cancelado) {
          setCargandoBackend(false);
          setYaSincronizo(true);
        }
      });

    return () => { cancelado = true; clearInterval(intervalo); };
  }, [usuario]);

  // Cargar feriados (para bloquear en el calendario de retiro)
  useEffect(() => {
    if (!usuario || usuario.tipo === 'preview') return;
    fetch(`${BACKEND_URL}/api/feriados`)
      .then(r => r.json())
      .then(data => { if (data && data.ok) setFeriados(data.feriados || []); })
      .catch(() => {});
  }, [usuario]);

  // Genera los días válidos para retiro: próximos 30 días, sin hoy, sin
  // domingos, sin feriados. (Es un hook: va ANTES de cualquier return.)
  const diasRetiroValidos = useMemo(() => {
    const dias = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const nombresDia = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let i = 1; i <= 30 && dias.length < 20; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      const diaSemana = d.getDay();
      if (diaSemana === 0) continue;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (feriados.includes(iso)) continue;
      const horario = diaSemana === 6 ? '8:30 a 11:30' : '7:30 a 15:30';
      dias.push({
        valor: iso,
        etiqueta: `${nombresDia[diaSemana]} ${d.getDate()}/${d.getMonth() + 1}`,
        horario
      });
    }
    return dias;
  }, [feriados]);

  const listaActual = usuario?.lista;
  const esConsumidor = usuario?.tipo === 'consumidor';
  const esPreview = usuario?.tipo === 'preview';
  const puedeElegirEnvio = puedeElegirEntrega(usuario);
  // El descuento del 5% solo aplica a Lista 2 cuando RETIRA en local
  const tieneDescuento = listaActual === 2 && modalidadEntrega === 'retiro';

  const categorias = useMemo(() => {
    return ['Todas', ...new Set(productos.map(p => p.categoria))];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const filtrados = productos.filter(p => {
      const texto = busqueda.toLowerCase();
      const coincideBusqueda = p.nombre.toLowerCase().includes(texto) || 
                                p.codigo.toLowerCase().includes(texto) ||
                                (p.marca || '').toLowerCase().includes(texto) ||
                                (p.categoria || '').toLowerCase().includes(texto);
      const coincideCategoria = categoriaActiva === 'Todas' || p.categoria === categoriaActiva;
      const coincideMarca = marcasSeleccionadas.length === 0 || marcasSeleccionadas.includes(p.marca);
      return coincideBusqueda && coincideCategoria && coincideMarca;
    });
    // Orden alfabético por MARCA, y dentro de cada marca por nombre.
    // Los sin marca van al final.
    filtrados.sort((a, b) => {
      const ma = (a.marca || 'ZZZZ').toLowerCase();
      const mb = (b.marca || 'ZZZZ').toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb);
      return (a.nombre || '').localeCompare(b.nombre || '');
    });
    return filtrados;
  }, [productos, busqueda, categoriaActiva, marcasSeleccionadas]);

  // Marcas agrupadas por letra inicial (para el menú desplegable A-B-C...)
  const marcasPorLetra = useMemo(() => {
    const lista = [...new Set(productos.map(p => p.marca).filter(m => m && m.trim() !== ''))];
    lista.sort((a, b) => a.localeCompare(b));
    const grupos = {};
    lista.forEach(marca => {
      const letra = marca.charAt(0).toUpperCase();
      if (!grupos[letra]) grupos[letra] = [];
      grupos[letra].push(marca);
    });
    return grupos;
  }, [productos]);

  const toggleMarca = (marca) => {
    setMarcasSeleccionadas(prev => 
      prev.includes(marca) ? prev.filter(m => m !== marca) : [...prev, marca]
    );
  };

  const formatearPrecio = (precio) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(precio);
  };

  const obtenerPrecioUnitario = (producto) => producto.precios[listaActual] || 0;
  const obtenerPrecioBulto = (producto) => obtenerPrecioUnitario(producto) * (producto.unidadesPorBulto || 1);

  const parsearListas1a4 = async (archivo) => {
    const buffer = await archivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Buscar la fila de encabezados: tiene "Código", "Descripción" y al menos "Lista 1"
    let filaHeader = -1;
    for (let i = 0; i < Math.min(filas.length, 25); i++) {
      const fila = (filas[i] || []).map(c => String(c).toLowerCase().trim());
      const tieneCodigo = fila.some(c => c === 'código' || c === 'codigo');
      const tieneDesc = fila.some(c => c.includes('descrip'));
      const tieneLista = fila.some(c => c.includes('lista 1') || c === 'lista1');
      if (tieneCodigo && tieneDesc && tieneLista) {
        filaHeader = i;
        break;
      }
    }
    if (filaHeader === -1) throw new Error('Listas 1-4: no se encontró la fila de encabezados (Código / Descripción / Lista 1...)');
    
    const headers = (filas[filaHeader] || []).map(h => String(h).toLowerCase().trim());
    const idxCodigo = headers.findIndex(h => h === 'código' || h === 'codigo');
    const idxDesc = headers.findIndex(h => h.includes('descrip'));
    const idxL1 = headers.findIndex(h => h.includes('lista 1') || h === 'lista1');
    const idxL2 = headers.findIndex(h => h.includes('lista 2') || h === 'lista2');
    const idxL3 = headers.findIndex(h => h.includes('lista 3') || h === 'lista3');
    const idxL4 = headers.findIndex(h => h.includes('lista 4') || h === 'lista4');
    
    // Detectar filas de basura/título/encabezado repetido
    const esTextoBasura = (txt) => {
      const t = txt.toLowerCase();
      return t.includes('distribuidora') || t.includes('consulta de cambios') ||
             t.includes('filtrado por') || t === 'código' || t === 'codigo' ||
             t.includes('descrip') || t.includes('artículos cuya') || t.includes('articulos cuya');
    };
    
    const parsearPrecio = (val) => {
      if (typeof val === 'number') return val;
      return parseFloat(String(val).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    };
    
    const productos = {};
    for (let i = filaHeader + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      const codigo = String(fila[idxCodigo] || '').trim();
      const descripcion = String(fila[idxDesc] || '').trim();
      
      // Saltar basura y encabezados repetidos
      if (esTextoBasura(codigo) || esTextoBasura(descripcion)) continue;
      // Un producto necesita código Y descripción
      if (!codigo || !descripcion) continue;
      
      productos[codigo] = {
        codigo, nombre: descripcion,
        precios: {
          1: parsearPrecio(fila[idxL1]),
          2: parsearPrecio(fila[idxL2]),
          3: parsearPrecio(fila[idxL3]),
          4: parsearPrecio(fila[idxL4]),
          5: 0,
        }
      };
    }
    return productos;
  };

  const parsearLista5 = async (archivo) => {
    const buffer = await archivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Buscar la fila de encabezados (la que tiene "Código", "Descripción" y "Precio")
    let filaHeader = -1;
    for (let i = 0; i < Math.min(filas.length, 25); i++) {
      const fila = (filas[i] || []).map(c => String(c).toLowerCase().trim());
      const tieneCodigo = fila.some(c => c === 'código' || c === 'codigo');
      const tieneDesc = fila.some(c => c.includes('descrip'));
      const tienePrecio = fila.some(c => c === 'precio');
      if (tieneCodigo && tieneDesc && tienePrecio) {
        filaHeader = i;
        break;
      }
    }
    if (filaHeader === -1) throw new Error('Lista 5: no se encontró la fila de encabezados (Código / Descripción / Precio)');
    
    const headers = (filas[filaHeader] || []).map(h => String(h).toLowerCase().trim());
    const idxCodigo = headers.findIndex(h => h === 'código' || h === 'codigo');
    const idxDesc = headers.findIndex(h => h.includes('descrip'));
    const idxPrecio = headers.findIndex(h => h === 'precio');
    
    // Palabras que indican que una fila es basura/título (no es marca ni producto)
    const esTextoBasura = (txt) => {
      const t = txt.toLowerCase();
      return t.includes('distribuidora') || t.includes('lista de precio') || 
             t.includes('los precios') || t === 'código' || t === 'codigo' ||
             t.includes('descrip') || t === 'precio';
    };
    
    const productos = {};
    let marcaActual = '';
    
    for (let i = filaHeader + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      const codigo = String(fila[idxCodigo] || '').trim();
      const descripcion = String(fila[idxDesc] || '').trim();
      const precioRaw = fila[idxPrecio];
      const tienePrecio = precioRaw !== '' && precioRaw !== null && precioRaw !== undefined;

      // Saltar filas de encabezado repetidas o títulos que reaparecen al scrollear
      if (esTextoBasura(codigo) || esTextoBasura(descripcion)) continue;
      
      // Fila vacía: ignorar
      if (!codigo && !descripcion) continue;
      
      // Fila de MARCA: texto en columna Código, sin descripción y sin precio
      // Ej: "ALF BARRIGON" en columna A, resto vacío
      if (codigo && !descripcion && !tienePrecio) {
        marcaActual = codigo;
        continue;
      }
      // Separador alternativo: texto en descripción, sin código ni precio
      if (!codigo && descripcion && !tienePrecio) {
        marcaActual = descripcion;
        continue;
      }
      
      // Fila de producto: necesita código Y descripción
      if (!codigo || !descripcion) continue;
      
      const parsearPrecio = (val) => {
        if (typeof val === 'number') return val;
        return parseFloat(String(val).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      };
      
      productos[codigo] = {
        codigo, nombre: descripcion,
        marca: marcaActual,
        categoria: marcaActual || 'Sin categoría',
        precioLista5: parsearPrecio(precioRaw),
      };
    }
    return productos;
  };

  const procesarArchivosListas = async () => {
    if (!archivosListas.listas1a4 && !archivosListas.lista5) {
      setMensajeCarga('⚠️ Subí al menos un archivo de listas');
      return;
    }
    
    setProcesandoListas(true);
    setMensajeCarga('Procesando archivos...');
    
    try {
      let prods1a4 = {};
      let prods5 = {};
      
      if (archivosListas.listas1a4) prods1a4 = await parsearListas1a4(archivosListas.listas1a4);
      if (archivosListas.lista5) prods5 = await parsearLista5(archivosListas.lista5);
      
      const todosLosCodigos = new Set([...Object.keys(prods1a4), ...Object.keys(prods5)]);
      const productosUnificados = [];
      let id = 1;
      
      todosLosCodigos.forEach(codigo => {
        const p1 = prods1a4[codigo];
        const p5 = prods5[codigo];
        // La Lista 5 manda para nombre y marca (es la que tiene los productos organizados por marca).
        // Si por algún motivo un código solo está en Listas 1-4, se usa ese nombre como respaldo.
        const nombre = p5?.nombre || p1?.nombre || '';
        const marca = p5?.marca || '';
        const categoria = detectarCategoriaEspecial(nombre, marca);
        
        productosUnificados.push({
          id: id++,
          codigo, nombre, marca, categoria,
          imagen: obtenerUrlImagen(codigo, nombre),
          porBulto: false,
          unidadesPorBulto: 1,
          precios: {
            1: p1?.precios[1] || 0,
            2: p1?.precios[2] || 0,
            3: p1?.precios[3] || 0,
            4: p1?.precios[4] || 0,
            5: p5?.precioLista5 || 0,
          }
        });
      });
      
      productosUnificados.sort((a, b) => {
        // Primero por marca (alfabético), después por nombre (alfabético) dentro de cada marca
        const marcaA = a.marca || 'ZZZ'; // los sin marca van al final
        const marcaB = b.marca || 'ZZZ';
        if (marcaA !== marcaB) return marcaA.localeCompare(marcaB);
        return a.nombre.localeCompare(b.nombre);
      });
      
      setProductos(productosUnificados);
      setMensajeCarga(`✅ ${productosUnificados.length} productos cargados`);
      setArchivosListas({ listas1a4: null, lista5: null });
      
      setTimeout(() => {
        setMostrarCarga(false);
        setMensajeCarga('');
      }, 2500);
    } catch (error) {
      setMensajeCarga(`❌ Error: ${error.message}`);
    } finally {
      setProcesandoListas(false);
    }
  };

  const parsearCSVClientes = (texto) => {
    const lineas = texto.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return [];
    const separador = lineas[0].includes(';') ? ';' : ',';
    const headers = lineas[0].split(separador).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const clientes = [];
    for (let i = 1; i < lineas.length; i++) {
      const valores = lineas[i].split(separador).map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = valores[idx] || ''; });
      const numero = obj.numero || obj.número || obj.codigo || obj.código || '';
      const clave = obj.clave || obj.password || obj.contraseña || '1234';
      const nombre = obj.nombre || obj.razon_social || obj.razón_social || '';
      const lista = parseInt(obj.lista || '4') || 4;
      const ciudad = obj.ciudad || obj.localidad || '';
      if (numero) clientes.push({ numero, clave, nombre, lista, ciudad });
    }
    return clientes;
  };

  const manejarCargaArchivoClientes = (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (e) => {
      try {
        const nuevosClientes = parsearCSVClientes(e.target.result);
        if (nuevosClientes.length === 0) { setMensajeCarga('⚠️ No se encontraron clientes'); return; }
        setClientes(nuevosClientes);
        setMensajeCarga(`✅ ${nuevosClientes.length} clientes cargados`);
        setTimeout(() => { setMostrarCarga(false); setMensajeCarga(''); }, 2000);
      } catch (error) {
        setMensajeCarga('❌ Error al leer el archivo');
      }
    };
    lector.readAsText(archivo, 'UTF-8');
  };

  const descargarPlantillaClientes = () => {
    const plantilla = 'numero,clave,nombre,lista,ciudad\n1001,1234,Supermercado Lin,1,Bahía Blanca\n2001,1234,Kiosco El Sol,2,Punta Alta\n3001,1234,Hipermercado Norte,3,Médanos\n5001,1234,Juan Pérez,5,Tornquist';
    const blob = new Blob([plantilla], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_clientes.csv';
    link.click();
  };

  const claveCarrito = (productoId, unidad) => `${productoId}_${unidad}`;

  const agregarAlCarrito = (producto, unidad = 'unidad') => {
    const clave = claveCarrito(producto.id, unidad);
    setCarrito(prev => ({
      ...prev,
      [clave]: { producto, unidad, cantidad: (prev[clave]?.cantidad || 0) + 1 }
    }));
  };

  const establecerCantidad = (producto, unidad, cantidad) => {
    const clave = claveCarrito(producto.id, unidad);
    const cantNum = parseInt(cantidad) || 0;
    setCarrito(prev => {
      const nuevoCarrito = { ...prev };
      if (cantNum <= 0) delete nuevoCarrito[clave];
      else nuevoCarrito[clave] = { producto, unidad, cantidad: cantNum };
      return nuevoCarrito;
    });
  };

  const quitarDelCarrito = (clave) => {
    setCarrito(prev => {
      const nuevoCarrito = { ...prev };
      if (nuevoCarrito[clave].cantidad > 1) nuevoCarrito[clave].cantidad -= 1;
      else delete nuevoCarrito[clave];
      return nuevoCarrito;
    });
  };

  const eliminarDelCarrito = (clave) => {
    setCarrito(prev => { const nc = { ...prev }; delete nc[clave]; return nc; });
  };

  const subtotalCarrito = useMemo(() => {
    return Object.values(carrito).reduce((total, item) => {
      const precio = item.unidad === 'bulto' ? obtenerPrecioBulto(item.producto) : obtenerPrecioUnitario(item.producto);
      return total + (precio * item.cantidad);
    }, 0);
  }, [carrito, listaActual]);

  const descuento = tieneDescuento ? subtotalCarrito * 0.05 : 0;
  const totalCarrito = subtotalCarrito - descuento;
  const cantidadItemsCarrito = useMemo(() => Object.values(carrito).reduce((t, i) => t + i.cantidad, 0), [carrito]);
  const cumpleMinimo = !esConsumidor || subtotalCarrito >= MINIMO_CONSUMIDOR_FINAL;

  if (!usuario) return <PantallaLogin onLogin={setUsuario} />;

  // Después del login: pantalla de carga con el camioncito hasta que
  // los productos lleguen del backend (primera sincronización).
  if (!yaSincronizo) {
    // Logos que desfilan en la carga: los de las marcas ya cargadas, o una
    // selección fija si todavía no hay productos.
    const marcasParaLogos = productos.length > 0
      ? [...new Set(productos.map(p => p.marca).filter(Boolean))].slice(0, 30)
      : ['ARCOR GOLOSINAS', 'ARCOR ALMACEN', 'GRANIX', 'GUAYMALLEN', 'DON SATUR', 'CROPPERS GONATURAL',
         'MOLTO', 'ALF GULA', 'VAUQUITA', 'MAFALDA', 'DON EMILIO', 'GAONA', 'RIQUITOS', 'DOS HERMANOS',
         'FELIPE FORT', 'NIKITOS', 'TRIO', 'ZUPAY', 'DULCOR SA', 'MANOLITO', 'CARIMEL', 'DONOSTI'];
    const logosMarcas = marcasParaLogos.map(obtenerUrlLogoMarca).filter(Boolean);
    return <PantallaCarga progreso={progresoCarga} logoUrl={LOGO_URL} logosMarcas={logosMarcas} />;
  }

  // Formatea 'YYYY-MM-DD' a 'DD/MM/AAAA' para mostrar y mandar
  const formatearFecha = (iso) => {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  };

  const enviarPedido = async () => {
    if (Object.keys(carrito).length === 0 || !cumpleMinimo) return;
    if (!usuario.token) {
      setPedidoError('Tu sesión expiró. Volvé a iniciar sesión para enviar el pedido.');
      return;
    }

    // Determinar la modalidad de entrega real
    const entrega = puedeElegirEnvio ? modalidadEntrega : 'retiro';

    // Si es retiro, el día es obligatorio
    if (entrega === 'retiro' && !diaRetiro) {
      setPedidoError('Elegí el día de retiro.');
      return;
    }

    // Armamos los items en el formato que espera el backend: { codigoArticulo, cantidad }
    // (el precio lo pone Flexxus, no lo mandamos por seguridad)
    const items = Object.values(carrito).map(item => ({
      codigoArticulo: item.producto.codigo,
      cantidad: item.cantidad
    }));

    setEnviandoPedido(true);
    setPedidoError('');
    try {
      const r = await fetch(`${BACKEND_URL}/api/pedido`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: usuario.token,
          items,
          entrega,
          diaRetiro: entrega === 'retiro' ? formatearFecha(diaRetiro) : '',
          observaciones: observacionesPedido
        })
      });
      const data = await r.json();
      if (data.ok) {
        setPedidoOk({ numero: data.numeroPedido, total: data.total, items: data.totalItems });
        setCarrito({});   // vaciar el carrito al confirmar
        setDiaRetiro(''); setObservacionesPedido('');
        try { if (claveCarritoGuardado) window.localStorage.removeItem(claveCarritoGuardado); } catch (e) {}
      } else if (data.motivo === 'sesion_vencida') {
        setPedidoError('Tu sesión expiró. Volvé a iniciar sesión para enviar el pedido.');
      } else {
        setPedidoError(data.motivo || 'No se pudo enviar el pedido.');
      }
    } catch (e) {
      setPedidoError('No se pudo conectar. Revisá tu internet e intentá de nuevo.');
    } finally {
      setEnviandoPedido(false);
    }
  };

  const cerrarSesion = () => {
    setUsuario(null);
    setCarrito({});
    setBusqueda('');
    setCategoriaActiva('Todas');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="text-white shadow-lg sticky top-0 z-40 relative" style={{ background: `linear-gradient(135deg, ${COLORS.azul} 0%, ${COLORS.azulOscuro} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 py-3 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-lg p-1.5 flex items-center justify-center">
                <LogoSanRas size="normal" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black leading-tight tracking-tight" style={{ fontFamily: 'Impact, "Arial Black", sans-serif', letterSpacing: '-0.02em' }}>
                  DISTRIBUIDORA SAN-RAS SA
                </h1>
                <p className="text-xs text-blue-100">
                  {esPreview ? 'Modo previsualización · sin precios' : (esConsumidor ? 'Consumidor Final' : `${usuario.nombre} · ${NOMBRES_LISTAS[listaActual]}`)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {esPreview ? (
                <button onClick={() => setUsuario(null)} className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors text-sm font-bold">
                  Ingresar
                </button>
              ) : (
              <>
              <button onClick={() => setMostrarCarrito(true)} className="relative bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors">
                <ShoppingCart className="w-5 h-5" />
                {cantidadItemsCarrito > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{cantidadItemsCarrito}</span>
                )}
              </button>
              <button onClick={() => setMostrarAdmin(true)} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={cerrarSesion} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
              </>
              )}
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, marca o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Barra de marcas + categorías con flechas de desplazamiento */}
          <div className="flex items-center gap-1">
            {/* Botón Todas / Marcas con desplegable */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMostrarMenuMarcas(!mostrarMenuMarcas)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                  marcasSeleccionadas.length > 0 ? 'bg-white' : (categoriaActiva === 'Todas' ? 'bg-white' : 'bg-white/20 text-white hover:bg-white/30')
                }`}
                style={(marcasSeleccionadas.length > 0 || categoriaActiva === 'Todas') ? { color: COLORS.azul } : {}}
              >
                {marcasSeleccionadas.length === 0 
                  ? 'Marcas' 
                  : `${marcasSeleccionadas.length} marca${marcasSeleccionadas.length > 1 ? 's' : ''}`}
                <ChevronDown className={`w-4 h-4 transition-transform ${mostrarMenuMarcas ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Separador */}
            <div className="w-px h-6 bg-white/30 flex-shrink-0 mx-1"></div>

            {/* Flecha izquierda */}
            <button
              onClick={() => {
                const cont = document.getElementById('barra-categorias');
                if (cont) cont.scrollBy({ left: -200, behavior: 'smooth' });
              }}
              className="flex-shrink-0 text-white/70 hover:text-white p-1"
              aria-label="Desplazar a la izquierda"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Categorías (scroll sin barra visible) */}
            <div
              id="barra-categorias"
              className="flex gap-2 overflow-x-auto flex-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`#barra-categorias::-webkit-scrollbar { display: none; }`}</style>
              <button
                onClick={() => { setCategoriaActiva('Todas'); setMostrarMenuMarcas(false); }}
                className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                  categoriaActiva === 'Todas' ? 'bg-white' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                style={categoriaActiva === 'Todas' ? { color: COLORS.azul } : {}}
              >
                Todas
              </button>
              {categorias.filter(c => c !== 'Todas').map(cat => (
                <button
                  key={cat}
                  onClick={() => { setCategoriaActiva(cat); setMostrarMenuMarcas(false); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                    categoriaActiva === cat ? 'bg-white' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  style={categoriaActiva === cat ? { color: COLORS.azul } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Flecha derecha */}
            <button
              onClick={() => {
                const cont = document.getElementById('barra-categorias');
                if (cont) cont.scrollBy({ left: 200, behavior: 'smooth' });
              }}
              className="flex-shrink-0 text-white/70 hover:text-white p-1"
              aria-label="Desplazar a la derecha"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Menú desplegable de marcas (tapa parte del catálogo) */}
          {mostrarMenuMarcas && (
            <>
              {/* Fondo para cerrar al tocar afuera */}
              <div className="fixed inset-0 z-30" onClick={() => setMostrarMenuMarcas(false)}></div>
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-b-xl shadow-2xl z-40 max-h-[70vh] flex flex-col mx-4">
                {/* Buscador de marcas */}
                <div className="p-3 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar marca..."
                      value={busquedaMarca}
                      onChange={(e) => setBusquedaMarca(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {marcasSeleccionadas.length > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">{marcasSeleccionadas.length} marca(s) seleccionada(s)</span>
                      <button
                        onClick={() => setMarcasSeleccionadas([])}
                        className="text-xs font-bold hover:underline"
                        style={{ color: COLORS.azul }}
                      >
                        Limpiar selección
                      </button>
                    </div>
                  )}
                </div>

                {/* Lista de marcas agrupadas por letra */}
                <div className="overflow-y-auto flex-1 p-2">
                  {Object.keys(marcasPorLetra).length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-8">
                      No hay marcas cargadas todavía
                    </div>
                  ) : (
                    Object.keys(marcasPorLetra).sort().map(letra => {
                      const marcasDeLetra = marcasPorLetra[letra].filter(m => 
                        m.toLowerCase().includes(busquedaMarca.toLowerCase())
                      );
                      if (marcasDeLetra.length === 0) return null;
                      return (
                        <div key={letra} className="mb-2">
                          <div className="px-2 py-1 text-xs font-black text-white rounded sticky top-0" style={{ backgroundColor: COLORS.azul }}>
                            {letra}
                          </div>
                          {marcasDeLetra.map(marca => (
                            <label
                              key={marca}
                              className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={marcasSeleccionadas.includes(marca)}
                                onChange={() => toggleMarca(marca)}
                                className="w-4 h-4 rounded"
                                style={{ accentColor: COLORS.azul }}
                              />
                              <LogoMarca marca={marca} tamano="chico" fallbackTexto={false} />
                              <span className="text-sm text-gray-700">{marca}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Botón aplicar/cerrar */}
                <div className="p-3 border-t">
                  <button
                    onClick={() => setMostrarMenuMarcas(false)}
                    className="w-full py-2 rounded-lg font-bold text-white text-sm"
                    style={{ backgroundColor: COLORS.azul }}
                  >
                    {(() => {
                      const totalMarcas = Object.values(marcasPorLetra).reduce((s, arr) => s + arr.length, 0);
                      return `Ver ${totalMarcas} marca${totalMarcas !== 1 ? 's' : ''}`;
                    })()}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {cargandoBackend && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800 text-center">
          Actualizando productos y precios...
        </div>
      )}
      {errorBackend && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-sm text-orange-800 text-center">
          <AlertCircle className="w-4 h-4 inline mr-1" />
          {errorBackend}
        </div>
      )}

      {esConsumidor && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 text-center">
          <AlertCircle className="w-4 h-4 inline mr-1" />
          Compra mínima: <strong>{formatearPrecio(MINIMO_CONSUMIDOR_FINAL)}</strong> · Retiro en distribuidora
        </div>
      )}
      {listaActual === 2 && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-800 text-center">
          ✨ Tenés <strong>5% de descuento</strong> retirando la mercadería en la distribuidora
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span>{productosFiltrados.length} {productosFiltrados.length === 1 ? 'producto' : 'productos'}</span>
          {marcasSeleccionadas.map(m => (
            <span key={m} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-bold">
              {m}
              <button onClick={() => toggleMarca(m)} className="hover:text-blue-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {categoriaActiva !== 'Todas' && (
            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-bold">
              {categoriaActiva}
              <button onClick={() => setCategoriaActiva('Todas')} className="hover:text-blue-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {productosFiltrados.map(producto => {
              const precioUnit = obtenerPrecioUnitario(producto);
              const precioBult = obtenerPrecioBulto(producto);
              const cantUnidad = carrito[claveCarrito(producto.id, 'unidad')]?.cantidad || 0;
              const cantBulto = carrito[claveCarrito(producto.id, 'bulto')]?.cantidad || 0;
              const modoActual = modoSeleccion[producto.id] || 'unidad';
              const tieneBulto = producto.porBulto && producto.unidadesPorBulto > 1;
              
              return (
                <div key={producto.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  <div className="aspect-square overflow-hidden bg-gray-100 relative">
                    <img
                      src={producto.imagen}
                      alt={producto.nombre}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://via.placeholder.com/400/1e2a6e/ffffff?text=${encodeURIComponent(producto.nombre.substring(0, 30))}`;
                      }}
                    />
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="h-11 flex items-center mb-1">
                      <LogoMarca marca={producto.marca || producto.categoria} descripcion={producto.nombre} tamano="tarjeta" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mt-1 mb-1 line-clamp-2 text-sm flex-1">{producto.nombre}</h3>
                    <div className="text-xs text-gray-400 mb-2">Cód: {producto.codigo}</div>

                    {/* Aviso de stock */}
                    {producto.sinStock && (
                      <div className="text-xs font-semibold text-red-600 mb-1">Sin stock</div>
                    )}

                    {producto.sinPrecio ? (
                      /* MODO PREVISUALIZACIÓN: sin precios */
                      <div className="text-xs mb-2 leading-snug p-2 rounded-lg bg-blue-50 border border-blue-100" style={{ color: COLORS.azul }}>
                        Date de alta como cliente en San-Ras para acceder a la lista de precios
                      </div>
                    ) : (
                      <>
                        {/* Precio principal (el de venta según la lista del cliente) */}
                        <div className="text-lg font-black mb-1" style={{ color: COLORS.azul }}>
                          {formatearPrecio(precioUnit)}
                          {producto.soloBulto && (
                            <span className="text-xs text-gray-500 font-normal"> / bulto</span>
                          )}
                        </div>

                        {/* Desglose de empaque calculado por el backend */}
                        {producto.empaque && (
                          <div className="text-xs mb-2 leading-snug">
                            {producto.empaque.avisoFaltaDato ? (
                              <span className="text-orange-600 font-semibold">⚠ Revisar</span>
                            ) : (
                              <>
                                {producto.soloBulto ? (
                                  <>
                                    <div className="font-semibold" style={{ color: COLORS.azul }}>
                                      {producto.empaque.mensajePrincipal}
                                    </div>
                                    {producto.empaque.mensajeReferencia && (
                                      <div className="text-gray-500">{producto.empaque.mensajeReferencia}</div>
                                    )}
                                  </>
                                ) : (
                                  producto.empaque.mensajeReferencia && (
                                    <div className="text-gray-500">{producto.empaque.mensajeReferencia}</div>
                                  )
                                )}
                              </>
                            )}
                          </div>
                        )}

                        <ControlCantidad
                          producto={producto}
                          modoActual="unidad"
                          cantidadActual={cantUnidad}
                          onEstablecerCantidad={establecerCantidad}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmación de pedido cargado en Flexxus */}
      {pedidoOk && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#dcfce7' }}>
              <Check className="w-9 h-9" style={{ color: '#16a34a' }} />
            </div>
            <h3 className="text-xl font-black mb-1" style={{ color: COLORS.azul }}>¡Pedido enviado!</h3>
            <p className="text-gray-600 text-sm mb-4">
              Tu pedido entró correctamente. Lo vamos a revisar y preparar.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">N° de pedido</span><strong>{pedidoOk.numero}</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Artículos</span><strong>{pedidoOk.items}</strong></div>
              {pedidoOk.total != null && (
                <div className="flex justify-between"><span className="text-gray-500">Total</span><strong>{formatearPrecio(pedidoOk.total)}</strong></div>
              )}
            </div>
            <button onClick={() => { setPedidoOk(null); setMostrarCarrito(false); }}
              className="w-full py-3 rounded-lg font-bold text-white" style={{ backgroundColor: COLORS.azul }}>
              Listo
            </button>
          </div>
        </div>
      )}

      {mostrarCarrito && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b" style={{ backgroundColor: COLORS.azul, color: 'white', borderRadius: '0.75rem 0.75rem 0 0' }}>
              <h2 className="text-xl font-black flex items-center gap-2" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
                <ShoppingCart className="w-5 h-5" />MI PEDIDO
              </h2>
              <button onClick={() => setMostrarCarrito(false)}><X className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {Object.keys(carrito).length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Tu pedido está vacío</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(carrito).map(([clave, item]) => {
                    const precio = item.unidad === 'bulto' ? obtenerPrecioBulto(item.producto) : obtenerPrecioUnitario(item.producto);
                    return (
                      <div key={clave} className="flex gap-3 bg-gray-50 p-3 rounded-lg">
                        <img src={item.producto.imagen} alt={item.producto.nombre} className="w-16 h-16 object-cover rounded" 
                             onError={(e) => { e.target.onerror = null; e.target.src = `https://via.placeholder.com/100/1e2a6e/ffffff?text=${encodeURIComponent(item.producto.codigo)}`; }} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-gray-800 truncate">{item.producto.nombre}</h3>
                          <p className="text-xs text-gray-500">
                            {item.unidad === 'bulto' ? `Bulto x${item.producto.unidadesPorBulto}` : 'Unidad'} · {formatearPrecio(precio)}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => quitarDelCarrito(clave)} className="w-7 h-7 bg-white border rounded flex items-center justify-center hover:bg-gray-100">
                                <Minus className="w-3 h-3" />
                              </button>
                              <input type="number" min="0" value={item.cantidad}
                                     onChange={(e) => establecerCantidad(item.producto, item.unidad, e.target.value)}
                                     onFocus={(e) => e.target.select()}
                                     className="font-bold text-sm w-12 text-center border rounded py-0.5 focus:outline-none focus:border-blue-500" />
                              <button onClick={() => agregarAlCarrito(item.producto, item.unidad)} className="w-7 h-7 bg-white border rounded flex items-center justify-center hover:bg-gray-100">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm" style={{ color: COLORS.azul }}>
                                {formatearPrecio(precio * item.cantidad)}
                              </span>
                              <button onClick={() => eliminarDelCarrito(clave)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {Object.keys(carrito).length > 0 && (
              <div className="border-t p-4 space-y-3">
                {/* Selector de modalidad de entrega (solo si el cliente puede elegir) */}
                {puedeElegirEnvio && (
                  <div>
                    <p className="text-sm font-bold mb-2" style={{ color: COLORS.azul }}>¿Cómo querés recibirlo?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setModalidadEntrega('retiro')}
                        className={`p-3 rounded-lg border-2 text-sm font-bold transition-all ${modalidadEntrega === 'retiro' ? 'text-white' : 'bg-white'}`}
                        style={modalidadEntrega === 'retiro' 
                          ? { backgroundColor: COLORS.azul, borderColor: COLORS.azul }
                          : { borderColor: COLORS.azul, color: COLORS.azul }}
                      >
                        <Home className="w-4 h-4 inline mr-1" />
                        Retiro en local
                        {listaActual === 2 && <div className="text-xs font-normal mt-0.5">5% descuento</div>}
                      </button>
                      <button
                        onClick={() => setModalidadEntrega('envio')}
                        className={`p-3 rounded-lg border-2 text-sm font-bold transition-all ${modalidadEntrega === 'envio' ? 'text-white' : 'bg-white'}`}
                        style={modalidadEntrega === 'envio' 
                          ? { backgroundColor: COLORS.azul, borderColor: COLORS.azul }
                          : { borderColor: COLORS.azul, color: COLORS.azul }}
                      >
                        <Truck className="w-4 h-4 inline mr-1" />
                        Envío a domicilio
                        <div className="text-xs font-normal mt-0.5">Sin costo</div>
                      </button>
                    </div>
                    {listaActual === 2 && modalidadEntrega === 'envio' && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                        ⚠️ El 5% de descuento no aplica con envío a domicilio.
                      </div>
                    )}
                  </div>
                )}

                {/* Calendario de retiro (cuando la entrega es retiro) */}
                {(!puedeElegirEnvio || modalidadEntrega === 'retiro') && (
                  <div>
                    <p className="text-sm font-bold mb-1" style={{ color: COLORS.azul }}>
                      <Home className="w-4 h-4 inline mr-1" />¿Qué día retirás?
                    </p>
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                      Demora mínima de 24hs. Para casos excepcionales, comunicate al{' '}
                      <a href={`https://wa.me/${WHATSAPP_DISTRIBUIDORA}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                        {TELEFONO_DISTRIBUIDORA_VISIBLE}
                      </a>.
                    </div>
                    <select
                      value={diaRetiro}
                      onChange={(e) => setDiaRetiro(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-sm"
                    >
                      <option value="">Elegí el día…</option>
                      {diasRetiroValidos.map(d => (
                        <option key={d.valor} value={d.valor}>{d.etiqueta} ({d.horario})</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Lun a Vie 7:30–15:30 · Sáb 8:30–11:30
                    </p>
                  </div>
                )}

                {/* Observaciones del pedido */}
                <div>
                  <p className="text-sm font-bold mb-1" style={{ color: COLORS.azul }}>Observaciones (opcional)</p>
                  <textarea
                    value={observacionesPedido}
                    onChange={(e) => setObservacionesPedido(e.target.value)}
                    placeholder="Ej: mandar factura A, entregar en horario de la tarde, etc."
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-sm resize-none"
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatearPrecio(subtotalCarrito)}</span>
                </div>
                {tieneDescuento && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Descuento 5% (retiro):</span>
                    <span className="font-semibold">-{formatearPrecio(descuento)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-lg font-black pt-2 border-t">
                  <span>TOTAL:</span>
                  <span style={{ color: COLORS.azul }}>{formatearPrecio(totalCarrito)}</span>
                </div>

                {esConsumidor && !cumpleMinimo && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>Falta <strong>{formatearPrecio(MINIMO_CONSUMIDOR_FINAL - subtotalCarrito)}</strong> para llegar al mínimo de compra.</div>
                  </div>
                )}

                {pedidoError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>{pedidoError}</div>
                  </div>
                )}

                <button
                  onClick={enviarPedido}
                  disabled={!cumpleMinimo || enviandoPedido}
                  className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  style={{ backgroundColor: (cumpleMinimo && !enviandoPedido) ? '#16a34a' : undefined }}
                >
                  <Send className="w-5 h-5" />{enviandoPedido ? 'Enviando pedido…' : 'Confirmar y enviar pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {mostrarAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black" style={{ color: COLORS.azul, fontFamily: 'Impact, "Arial Black", sans-serif' }}>ADMINISTRACIÓN</h2>
              <button onClick={() => { setMostrarAdmin(false); setMostrarCarga(false); setMensajeCarga(''); setArchivosListas({ listas1a4: null, lista5: null }); }}>
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {!mostrarCarga ? (
              <div className="space-y-3">
                <button onClick={() => { setTipoCargaArchivo('listas-excel'); setMostrarCarga(true); }} className="w-full p-4 border-2 rounded-xl text-left hover:bg-gray-50 transition-colors" style={{ borderColor: COLORS.azul }}>
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-6 h-6" style={{ color: COLORS.azul }} />
                    <div>
                      <div className="font-bold" style={{ color: COLORS.azul }}>Cargar listas de precios (Excel)</div>
                      <div className="text-xs text-gray-500">Subí los archivos .xlsx exportados de Flexxus</div>
                    </div>
                  </div>
                </button>
                <button onClick={() => { setTipoCargaArchivo('clientes'); setMostrarCarga(true); }} className="w-full p-4 border-2 rounded-xl text-left hover:bg-gray-50 transition-colors" style={{ borderColor: COLORS.azul }}>
                  <div className="flex items-center gap-3">
                    <Users className="w-6 h-6" style={{ color: COLORS.azul }} />
                    <div>
                      <div className="font-bold" style={{ color: COLORS.azul }}>Actualizar clientes</div>
                      <div className="text-xs text-gray-500">CSV con números, claves y listas</div>
                    </div>
                  </div>
                </button>

                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-gray-600">
                  <strong>Datos cargados:</strong><br/>
                  📦 {productos.length} productos · 👥 {clientes.length} clientes
                </div>
              </div>
            ) : tipoCargaArchivo === 'listas-excel' ? (
              <div className="space-y-3">
                <p className="text-gray-600 text-sm mb-4">
                  Subí los <strong>2 archivos Excel</strong> exportados de Flexxus. Se van a unir automáticamente por código.
                </p>

                <div className="border rounded-lg p-3">
                  <div className="font-semibold text-sm mb-2" style={{ color: COLORS.azul }}>📊 Listas 1 a 4</div>
                  <input type="file" accept=".xlsx,.xls,.ods"
                         onChange={(e) => setArchivosListas({...archivosListas, listas1a4: e.target.files[0]})}
                         className="text-xs w-full" />
                  {archivosListas.listas1a4 && (<div className="text-xs text-green-700 mt-1">✓ {archivosListas.listas1a4.name}</div>)}
                </div>

                <div className="border rounded-lg p-3">
                  <div className="font-semibold text-sm mb-2" style={{ color: COLORS.azul }}>📊 Lista 5</div>
                  <input type="file" accept=".xlsx,.xls,.ods"
                         onChange={(e) => setArchivosListas({...archivosListas, lista5: e.target.files[0]})}
                         className="text-xs w-full" />
                  {archivosListas.lista5 && (<div className="text-xs text-green-700 mt-1">✓ {archivosListas.lista5.name}</div>)}
                </div>

                <button onClick={procesarArchivosListas}
                        disabled={procesandoListas || (!archivosListas.listas1a4 && !archivosListas.lista5)}
                        className="w-full text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:bg-gray-300"
                        style={{ backgroundColor: (procesandoListas || (!archivosListas.listas1a4 && !archivosListas.lista5)) ? undefined : COLORS.azul }}>
                  <Upload className="w-5 h-5" />
                  {procesandoListas ? 'Procesando...' : 'Procesar archivos'}
                </button>

                {mensajeCarga && (<div className="p-3 bg-gray-100 rounded-lg text-sm text-center">{mensajeCarga}</div>)}

                <button onClick={() => { setMostrarCarga(false); setMensajeCarga(''); setArchivosListas({ listas1a4: null, lista5: null }); }}
                        className="w-full py-2 text-gray-500 text-sm hover:text-gray-700">← Volver</button>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 text-sm mb-4">Subí el CSV con los clientes, sus claves y la lista que les corresponde.</p>

                <button onClick={descargarPlantillaClientes}
                        className="w-full mb-3 py-2 border rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-50"
                        style={{ borderColor: COLORS.azul, color: COLORS.azul }}>
                  <Download className="w-4 h-4" />Descargar plantilla
                </button>

                <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={manejarCargaArchivoClientes} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                        className="w-full text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                        style={{ backgroundColor: COLORS.azul }}>
                  <Upload className="w-5 h-5" />Elegir archivo CSV
                </button>

                {mensajeCarga && (<div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm text-center">{mensajeCarga}</div>)}

                <button onClick={() => { setMostrarCarga(false); setMensajeCarga(''); }}
                        className="w-full mt-3 py-2 text-gray-500 text-sm hover:text-gray-700">← Volver</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
