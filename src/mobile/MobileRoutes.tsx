import { Route, Routes } from "react-router-dom";

import MobileLayout from "@/mobile/MobileLayout";
import Inicio from "@/mobile/paginas/Inicio";
import NovaVenda from "@/mobile/paginas/NovaVenda";
import Vendas from "@/mobile/paginas/Vendas";
import Clientes from "@/mobile/paginas/Clientes";
import Estoque from "@/mobile/paginas/Estoque";
import SoNoComputador from "@/mobile/paginas/SoNoComputador";

/**
 * As rotas do app do celular — um app à parte, não a tela do computador
 * encolhida. Mesmos endereços para os mesmos assuntos (`/vendas` é Vendas nos
 * dois), então um link compartilhado abre o lugar certo em qualquer aparelho.
 */
const MobileRoutes = () => (
  <Routes>
    <Route path="/" element={<MobileLayout />}>
      <Route index element={<Inicio />} />
      <Route path="pdv" element={<NovaVenda />} />
      <Route path="vendas" element={<Vendas />} />
      <Route path="clientes" element={<Clientes />} />
      <Route path="estoque" element={<Estoque />} />
      <Route path="*" element={<SoNoComputador />} />
    </Route>
  </Routes>
);

export default MobileRoutes;
