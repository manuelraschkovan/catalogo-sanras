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
  return {
    id: indice + 1,
    nombre: p.descripcion || '',
    categoria: detectarCategoriaEspecial(p.descripcion, p.marca) || 'Otros',
    codigo: p.codigo || '',
    marca: p.marca || '',
    imagen: obtenerUrlImagen(p.codigo, p.descripcion),
    porBulto: !!p.soloBulto,       // con BLT = solo bulto cerrado
    unidadesPorBulto: 1,           // el precio de Flexxus ya es el de venta
    stock: Number(p.stock) || 0,
    sinStock: !!p.sinStock,
    soloBulto: !!p.soloBulto,
    empaque: p.empaque || null,    // desglose calculado por el backend
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

// Detectar categoría especial según palabras clave en la descripción
const detectarCategoriaEspecial = (descripcion, marca) => {
  const desc = (descripcion || '').toUpperCase();
  // El orden importa: las reglas más específicas van primero
  const reglas = [
    // Snacks (antes de lácteos para que "papas sabor queso" caigan acá)
    { palabras: ['PAPA SAB', 'PAPITA', 'CHIZ', 'PALITO', 'MANI ', 'SNACK', 'PALITOS SAL', 'TWISTOS', 'PEHUAMAR'], categoria: 'Snacks' },
    // Dulces
    { palabras: ['AFJ', 'ALFAJOR'], categoria: 'Alfajores' },
    { palabras: ['GLLT', 'GALLET'], categoria: 'Galletitas' },
    { palabras: ['CHOC', 'CHOCOLATE', 'BOMBON'], categoria: 'Chocolates' },
    { palabras: ['CARAM', 'GOMITA', 'CHUPETIN', 'GOLOSINA', 'CHICLE', 'PASTILLA'], categoria: 'Golosinas' },
    { palabras: ['CRLS', 'CEREAL', 'BARRITA'], categoria: 'Cereales' },
    // Bebidas
    { palabras: ['GASEOSA', 'COCA', 'PEPSI', 'SPRITE', 'FANTA', 'MANAOS', 'SCHWEPPES', '7UP'], categoria: 'Gaseosas' },
    { palabras: ['AGUA MIN', 'AGUA SAB', 'AGUA SIN'], categoria: 'Aguas' },
    { palabras: ['JUGO', 'NESTEA', 'TANG', 'CLIGHT'], categoria: 'Jugos' },
    { palabras: ['CERVEZA'], categoria: 'Cervezas' },
    { palabras: ['VINO'], categoria: 'Vinos' },
    { palabras: ['FERNET', 'WHISKY', 'WISKY', 'GIN ', 'VODKA', 'APERITIVO', 'GANCIA'], categoria: 'Bebidas Blancas' },
    // Almacén
    { palabras: ['ACEITE'], categoria: 'Aceites' },
    { palabras: ['ARROZ'], categoria: 'Arroz' },
    { palabras: ['AZUC'], categoria: 'Azúcar' },
    { palabras: ['YERBA', 'MATE COCID'], categoria: 'Yerba y Mate' },
    { palabras: ['CAFE', 'CAPUCHIN'], categoria: 'Café' },
    { palabras: ['HARINA'], categoria: 'Harinas' },
    { palabras: ['CONSERV', 'ATUN', 'CABALLA', 'SARDINA', 'PURE TOMATE', 'ARVEJA', 'CHOCLO'], categoria: 'Conservas' },
    { palabras: ['LENTEJA', 'POROTO', 'GARBANZO', 'LEGUMBRE'], categoria: 'Legumbres' },
    { palabras: ['FIDEO', 'PASTA SEC', 'SPAGHETTI', 'MOSTACHO', 'TALLAR'], categoria: 'Fideos' },
    { palabras: ['SAL FIN', 'SAL GRUE', 'CONDIMENTO', 'PIMIENTA', 'OREGANO'], categoria: 'Condimentos' },
    // Lácteos (después de snacks para evitar conflictos con "queso")
    { palabras: ['LECHE', 'YOGUR', 'MANTECA', 'CREMA DE LECHE', 'DULCE DE LECHE', 'QUESO RALL', 'QUESO UNT', 'QUESO CREM', 'QUESO POR', 'QUESO BARR'], categoria: 'Lácteos' },
    // Limpieza e higiene
    { palabras: ['DETERG', 'LAVANDINA', 'JABON EN POLV', 'JABON LIQ', 'SUAVIZ', 'LIMPIA', 'DESINF', 'LUSTRA', 'CERA '], categoria: 'Limpieza' },
    { palabras: ['SHAMPO', 'SHAMPU', 'JABON DE TOC', 'DESODOR', 'PASTA DENT', 'CEPILLO DE D', 'ENJUAGUE'], categoria: 'Higiene Personal' },
    { palabras: ['PAPEL HIG', 'TOALLA DE PAP', 'SERVILLET', 'ROLLO COC', 'PAÑUELO'], categoria: 'Papelería' },
    // Mascotas y bebés
    { palabras: ['ALIMENTO PERR', 'ALIMENTO GAT', 'CACHORR', 'GATITO'], categoria: 'Mascotas' },
    { palabras: ['PAÑAL', 'TOALLITA HUM', 'BEBE'], categoria: 'Bebés' },
  ];
  
  for (const regla of reglas) {
    if (regla.palabras.some(p => desc.includes(p))) return regla.categoria;
  }
  return marca || 'Sin categoría';
};

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
function PantallaLogin({ onLogin, clientes }) {
  const [modo, setModo] = useState(null);
  const [numero, setNumero] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  const intentarLogin = () => {
    setError('');
    const cliente = clientes.find(c => c.numero === numero.trim() && c.clave === clave.trim());
    if (cliente) onLogin({ tipo: 'cliente', ...cliente });
    else setError('Número de cliente o clave incorrectos');
  };

  const entrarComoConsumidor = () => {
    onLogin({ tipo: 'consumidor', nombre: 'Consumidor Final', lista: 4 });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${COLORS.azul} 0%, ${COLORS.azulOscuro} 100%)` }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6 flex flex-col items-center">
          <LogoSanRas size="grande" />
        </div>

        {!modo && (
          <div className="space-y-3">
            <p className="text-center text-gray-600 mb-4">¿Cómo querés ingresar?</p>
            <button
              onClick={() => setModo('cliente')}
              className="w-full py-4 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: COLORS.azul }}
            >
              <Users className="w-5 h-5" />
              Soy cliente registrado
            </button>
            <button
              onClick={entrarComoConsumidor}
              className="w-full py-4 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-colors hover:bg-gray-50"
              style={{ borderColor: COLORS.azul, color: COLORS.azul }}
            >
              <ShoppingCart className="w-5 h-5" />
              Consumidor final
            </button>
            <p className="text-xs text-center text-gray-500 mt-4">
              Compra mínima consumidor final: ${MINIMO_CONSUMIDOR_FINAL.toLocaleString('es-AR')} · Retiro en distribuidora
            </p>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-gray-700 leading-relaxed">
                <strong style={{ color: COLORS.azul }}>¿Tenés autoservicio, almacén, kiosco o sos revendedor?</strong><br/>
                Si todavía no tenés número de cliente, comunicate al{' '}
                <a href={`https://wa.me/${WHATSAPP_DISTRIBUIDORA}`} target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: COLORS.azul }}>
                  {TELEFONO_DISTRIBUIDORA_VISIBLE}
                </a>
                {' '}para habilitarlo.
              </p>
            </div>
          </div>
        )}

        {modo === 'cliente' && (
          <div className="space-y-3">
            <h3 className="text-center font-bold text-gray-700 mb-2">Ingreso de cliente</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de cliente</label>
              <input
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && intentarLogin()}
                placeholder="Ej: 1001"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clave</label>
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && intentarLogin()}
                placeholder="••••"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={intentarLogin}
              className="w-full py-3 rounded-xl text-white font-bold transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: COLORS.azul }}
            >
              Ingresar
            </button>
            <button
              onClick={() => { setModo(null); setError(''); setNumero(''); setClave(''); }}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700"
            >
              ← Volver
            </button>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-gray-600">
              <strong>Clientes de prueba:</strong><br/>
              1001 / 1234 (Supermercado) · 2001 / 1234 (Comercio)<br/>
              3001 / 1234 (Hipermercado) · 5001 / 1234 (Revendedor)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ APP PRINCIPAL ============
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [productos, setProductos] = useState(productosEjemplo);
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
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [mostrarAdmin, setMostrarAdmin] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState({});
  const [archivosListas, setArchivosListas] = useState({ listas1a4: null, lista5: null });
  const [procesandoListas, setProcesandoListas] = useState(false);
  const [modalidadEntrega, setModalidadEntrega] = useState('retiro'); // 'retiro' | 'envio'
  const [cargandoBackend, setCargandoBackend] = useState(false);
  const [errorBackend, setErrorBackend] = useState('');
  const fileInputRef = useRef(null);

  // Cuando el usuario entra, traemos los productos del backend (Flexxus)
  // con el precio de SU lista. Si el backend no responde, quedan los de ejemplo.
  useEffect(() => {
    if (!usuario) return;
    const lista = usuario.lista;
    if (!lista) return;

    let cancelado = false;
    setCargandoBackend(true);
    setErrorBackend('');

    fetch(`${BACKEND_URL}/api/catalogo?lista=${lista}`)
      .then(r => {
        if (!r.ok) throw new Error('El servidor respondió ' + r.status);
        return r.json();
      })
      .then(data => {
        if (cancelado) return;
        if (data && data.ok && Array.isArray(data.productos)) {
          const convertidos = data.productos.map(convertirProductoBackend);
          setProductos(convertidos);
        } else {
          throw new Error('Respuesta inválida del servidor');
        }
      })
      .catch(err => {
        if (cancelado) return;
        // Si falla, dejamos los productos de ejemplo y avisamos discretamente
        setErrorBackend('No se pudieron cargar los productos actualizados. ' + err.message);
      })
      .finally(() => {
        if (!cancelado) setCargandoBackend(false);
      });

    return () => { cancelado = true; };
  }, [usuario]);

  const listaActual = usuario?.lista;
  const esConsumidor = usuario?.tipo === 'consumidor';
  const puedeElegirEnvio = puedeElegirEntrega(usuario);
  // El descuento del 5% solo aplica a Lista 2 cuando RETIRA en local
  const tieneDescuento = listaActual === 2 && modalidadEntrega === 'retiro';

  const categorias = useMemo(() => {
    return ['Todas', ...new Set(productos.map(p => p.categoria))];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      const texto = busqueda.toLowerCase();
      const coincideBusqueda = p.nombre.toLowerCase().includes(texto) || 
                                p.codigo.toLowerCase().includes(texto) ||
                                (p.marca || '').toLowerCase().includes(texto) ||
                                (p.categoria || '').toLowerCase().includes(texto);
      const coincideCategoria = categoriaActiva === 'Todas' || p.categoria === categoriaActiva;
      const coincideMarca = marcasSeleccionadas.length === 0 || marcasSeleccionadas.includes(p.marca);
      return coincideBusqueda && coincideCategoria && coincideMarca;
    });
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

  if (!usuario) return <PantallaLogin onLogin={setUsuario} clientes={clientes} />;

  const enviarPedidoWhatsApp = () => {
    if (Object.keys(carrito).length === 0 || !cumpleMinimo) return;

    let mensaje = `*🛒 NUEVO PEDIDO - DISTRIBUIDORA SAN-RAS SA*\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (esConsumidor) {
      mensaje += `*Tipo:* Consumidor Final\n*Lista:* 4\n`;
    } else {
      mensaje += `*Cliente:* ${usuario.nombre}\n*N° Cliente:* ${usuario.numero}\n*Lista:* ${listaActual}\n`;
      if (usuario.ciudad) mensaje += `*Ciudad:* ${usuario.ciudad}\n`;
    }
    mensaje += `*Fecha:* ${new Date().toLocaleDateString('es-AR')}\n`;
    
    // Modalidad de entrega
    if (esConsumidor) {
      mensaje += `*Entrega:* 📍 Retiro en distribuidora\n`;
    } else if (puedeElegirEnvio) {
      mensaje += `*Entrega:* ${modalidadEntrega === 'envio' ? '🚚 Envío a domicilio' : '📍 Retiro en local'}\n`;
    } else if (listaActual === 5) {
      mensaje += `*Entrega:* 📍 Retiro en distribuidora (Lista 5)\n`;
    } else {
      mensaje += `*Entrega:* 📍 Retiro en distribuidora\n`;
    }
    
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n*PRODUCTOS:*\n`;
    
    Object.values(carrito).forEach(item => {
      const precio = item.unidad === 'bulto' ? obtenerPrecioBulto(item.producto) : obtenerPrecioUnitario(item.producto);
      const subtotal = precio * item.cantidad;
      const tipoUnidad = item.unidad === 'bulto' ? `BULTO x${item.producto.unidadesPorBulto}` : 'UN';
      mensaje += `\n• [${item.producto.codigo}] ${item.producto.nombre}`;
      mensaje += `\n  ${item.cantidad} ${tipoUnidad} × ${formatearPrecio(precio)} = *${formatearPrecio(subtotal)}*`;
    });
    
    mensaje += `\n\n━━━━━━━━━━━━━━━━━━━━\n*Subtotal:* ${formatearPrecio(subtotalCarrito)}\n`;
    if (tieneDescuento) mensaje += `*Descuento 5% (retiro):* -${formatearPrecio(descuento)}\n`;
    mensaje += `*TOTAL:* ${formatearPrecio(totalCarrito)}`;
    
    const urlWhatsApp = ENVIO_WHATSAPP_ACTIVO 
      ? `https://wa.me/${WHATSAPP_DISTRIBUIDORA}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(urlWhatsApp, '_blank');
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
                  {esConsumidor ? 'Consumidor Final' : `${usuario.nombre} · ${NOMBRES_LISTAS[listaActual]}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
                    Ver {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}
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
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.azul }}>{producto.marca || producto.categoria}</span>
                    <h3 className="font-semibold text-gray-800 mt-1 mb-1 line-clamp-2 text-sm flex-1">{producto.nombre}</h3>
                    <div className="text-xs text-gray-400 mb-2">Cód: {producto.codigo}</div>

                    {/* Aviso de stock */}
                    {producto.sinStock && (
                      <div className="text-xs font-semibold text-red-600 mb-1">Sin stock</div>
                    )}

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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

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

                <button
                  onClick={enviarPedidoWhatsApp}
                  disabled={!cumpleMinimo}
                  className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                  style={{ backgroundColor: cumpleMinimo ? '#16a34a' : undefined }}
                >
                  <Send className="w-5 h-5" />Enviar pedido por WhatsApp
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
