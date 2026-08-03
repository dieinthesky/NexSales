/**
 * Planos comerciais CaixaDoBairro — fonte única para a página /planos.
 */

export const SUPPORT = {
  name: 'Luiz',
  phoneDisplay: '+55 88 9704-0491',
  /** Só dígitos, com DDI */
  phoneE164: '558897040491',
  whatsappMessage:
    'Olá Luiz! Vim pelo CaixaDoBairro e quero falar sobre o sistema do mercadinho.',
} as const

export function supportWhatsAppUrl(): string {
  return `https://wa.me/${SUPPORT.phoneE164}?text=${encodeURIComponent(SUPPORT.whatsappMessage)}`
}

export const PRICING = {
  entryMonths: 3,
  entryMonthly: 60,
  standardMonthly: 99,
  annual: 890,
  annualPerMonthApprox: 74,
} as const

export const FEATURE_DEMO_STEPS = [
  {
    title: '1. Venda no balcão',
    body: 'Bipa o código de barras ou digita o nome. O produto entra na venda na hora — como caixa de mercado.',
  },
  {
    title: '2. Várias formas de pagamento',
    body: 'Dinheiro, PIX (com QR na tela), cartão e pagamento misto. Fiado quando o cliente deixa na conta.',
  },
  {
    title: '3. Fiado sob controle',
    body: 'Cadastre o cliente, veja quanto deve e registre o pagamento parcial ou total.',
  },
  {
    title: '4. Estoque e inventário',
    body: 'Produto com estoque mínimo alerta no painel. No celular, visita de prateleira com câmera.',
  },
  {
    title: '5. Etiqueta e histórico',
    body: 'Imprima etiqueta de gôndola e consulte o histórico de vendas e o fechamento do dia.',
  },
] as const

export const FEATURE_LIST = [
  'Caixa (PDV) com bipagem de código de barras',
  'Cadastro de produtos, preços e categorias',
  'Controle de estoque e alerta de acabando',
  'Fiado / vale com histórico e recebimento',
  'PIX com QR Code na tela do caixa',
  'Dinheiro, cartão e pagamento dividido',
  'Etiqueta de prateleira (nome, preço, código)',
  'Histórico de vendas e fechamento de caixa',
  'Vários usuários (dono e funcionários)',
  'Inventário no celular (visita)',
  'App no computador + site na nuvem',
  'Lojas separadas (cada mercadinho com seus dados)',
] as const
