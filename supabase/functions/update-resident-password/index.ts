import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Método não permitido. Use POST." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({
        error: "Secrets ausentes na Edge Function.",
        detalhe: {
          SUPABASE_URL: Boolean(supabaseUrl),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
          SUPABASE_ANON_KEY: Boolean(anonKey),
        },
      }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const adminToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!adminToken) {
      return json({ error: "Token do administrador ausente." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${adminToken}` } },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: logged, error: loggedError } = await userClient.auth.getUser();

    if (loggedError || !logged?.user?.id) {
      return json({
        error: "Sessão inválida. Faça login novamente como administrador.",
        detalhe: loggedError?.message || null,
      }, 401);
    }

    const { data: adminProfile, error: adminProfileError } = await serviceClient
      .from("profiles")
      .select("id,email,role,ativo")
      .eq("id", logged.user.id)
      .maybeSingle();

    if (adminProfileError) {
      return json({
        error: "Erro ao verificar perfil administrativo.",
        detalhe: adminProfileError.message,
      }, 500);
    }

    if (!adminProfile || adminProfile.role !== "admin" || adminProfile.ativo === false) {
      return json({
        error: "O usuário logado não possui permissão administrativa na tabela profiles.",
      }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || body.id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || body.nova_senha || "");

    if (!userId && !email) {
      return json({ error: "Selecione um morador." }, 400);
    }

    if (password.length < 6) {
      return json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
    }

    let profile = null;

    if (userId) {
      const { data } = await serviceClient
        .from("profiles")
        .select("id,nome,email,role,ativo")
        .eq("id", userId)
        .maybeSingle();

      profile = data;
    }

    if (!profile && email) {
      const { data } = await serviceClient
        .from("profiles")
        .select("id,nome,email,role,ativo")
        .ilike("email", email)
        .maybeSingle();

      profile = data;
    }

    if (!profile) {
      return json({
        error: "Morador não encontrado na tabela profiles.",
        detalhe: { user_id_recebido: userId || null, email_recebido: email || null },
      }, 404);
    }

    if (profile.role !== "morador") {
      return json({ error: "O usuário selecionado não é um morador." }, 400);
    }

    if (!profile.email) {
      return json({ error: "O morador não possui e-mail cadastrado." }, 400);
    }

    // Método simples:
    // 1) Primeiro tenta alterar usando o ID do profile.
    // 2) Se não funcionar, procura o usuário no Auth pelo e-mail.
    let authUserId = profile.id;

    let updated = await serviceClient.auth.admin.updateUserById(authUserId, {
      password,
    });

    if (updated.error) {
      // Fallback por e-mail.
      let foundUser = null;

      for (let page = 1; page <= 20; page++) {
        const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers({
          page,
          perPage: 100,
        });

        if (listError) {
          return json({
            error: "Erro ao consultar usuários no Supabase Authentication.",
            detalhe: listError.message,
          }, 500);
        }

        foundUser = listData?.users?.find(
          (u) => String(u.email || "").toLowerCase() === String(profile.email).toLowerCase()
        );

        if (foundUser || !listData?.users?.length || listData.users.length < 100) break;
      }

      if (!foundUser?.id) {
        return json({
          error: "Este morador existe na tabela profiles, mas não existe em Authentication > Users com o mesmo e-mail.",
          detalhe: {
            email_do_morador: profile.email,
            profile_id: profile.id,
            erro_primeira_tentativa: updated.error.message,
          },
        }, 404);
      }

      authUserId = foundUser.id;

      updated = await serviceClient.auth.admin.updateUserById(authUserId, {
        password,
      });

      if (updated.error) {
        return json({
          error: "Supabase Auth recusou a alteração da senha.",
          detalhe: updated.error.message,
        }, 500);
      }

      // Sincroniza profile.id com auth.users.id se estiver divergente.
      if (authUserId !== profile.id) {
        const { error: syncError } = await serviceClient
          .from("profiles")
          .update({ id: authUserId })
          .eq("id", profile.id);

        if (syncError) {
          // Não bloqueia a troca de senha, apenas informa.
          return json({
            ok: true,
            mensagem: "Senha alterada com sucesso, mas o ID do profile estava divergente e não pôde ser sincronizado automaticamente.",
            aviso: syncError.message,
            morador: {
              nome: profile.nome,
              email: profile.email,
              auth_user_id_usado: authUserId,
              profile_id_antigo: profile.id,
            },
          });
        }
      }
    }

    return json({
      ok: true,
      mensagem: "Senha do morador alterada com sucesso.",
      morador: {
        nome: profile.nome,
        email: profile.email,
        auth_user_id_usado: authUserId,
      },
    });

  } catch (err) {
    return json({
      error: "Erro interno na Edge Function update-resident-password.",
      detalhe: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
