using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;

/// <summary>EF mapping for <see cref="VenueVerificationDocument"/>.</summary>
public class VenueVerificationDocumentConfiguration : IEntityTypeConfiguration<VenueVerificationDocument>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<VenueVerificationDocument> builder)
    {
        builder.ToTable("venue_verification_documents");

        builder.HasKey(d => d.Id);

        builder.Property(d => d.Label).IsRequired().HasMaxLength(200);
        builder.Property(d => d.ExternalUrl).IsRequired().HasMaxLength(1000);

        builder.HasIndex(d => d.RequestId);
    }
}
