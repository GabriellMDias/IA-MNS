-- Existing ia_mns account. DATABASE is resolved from the connected database.
-- Keep PUBLIC unchanged: its inherited CREATE/TEMP privileges need separate action.
GRANT CONNECT ON DATABASE {{DATABASE}} TO ia_mns;
GRANT USAGE ON SCHEMA public TO ia_mns;
GRANT SELECT ON public.venda TO ia_mns;
GRANT SELECT ON public.produto TO ia_mns;
GRANT SELECT ON public.loja TO ia_mns;
GRANT SELECT ON public.fornecedor TO ia_mns;
GRANT SELECT ON public.produtoaliquota TO ia_mns;
GRANT SELECT ON public.aliquota TO ia_mns;
GRANT SELECT ON public.mercadologico TO ia_mns;
GRANT SELECT ON public.centrocusto TO ia_mns;
GRANT SELECT ON public.comprador TO ia_mns;
-- PH-27: no price, cost, stock, document or password columns.
GRANT SELECT (id, id_produto, id_loja, id_situacaocadastro, descontinuado) ON public.produtocomplemento TO ia_mns;
GRANT SELECT (id, descricao, descricaocompleta) ON public.tipoembalagem TO ia_mns;
GRANT SELECT (id, descricao, id_situacaocadastro) ON public.familiaproduto TO ia_mns;
